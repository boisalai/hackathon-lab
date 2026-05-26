import { z } from "zod";
import { generateText, tool, stepCountIs } from "ai";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SYSTEM_PROMPT, anonymizeSchema, type AnonymizeResult } from "@/lib/anonymize-schema";
import { tryWithFallback } from "@/lib/with-fallback";
import { detectLeaks, summarize } from "@/lib/leak-detector";
import { prisma } from "@/lib/prisma";

const inputSchema = z.object({
  text: z.string().min(50).max(50_000),
  modelId: z.string(),
  // Phase 6B : si true, l'utilisateur a confirmé après l'avertissement du
  // détecteur de fuite — on saute le scan et on procède directement.
  override: z.boolean().optional(),
});

const TIMEOUT_MS = 300_000;

export async function POST(req: Request) {
  // 1. Auth
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Validation input
  const body = await req.json();
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.format() }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Garde-fou : détecteur de fuite (Phase 6B).
  // On scanne systématiquement avant tout appel modèle, sauf si l'utilisateur
  // a explicitement confirmé via `override`. Politique uniforme parce que tout
  // modèle local de l'app a aujourd'hui un `fallbackTo` cloud — donc le texte
  // est potentiellement exfiltrable même quand le modèle choisi est local.
  //
  // Quand l'utilisateur override, on rescanne pour journaliser ce qu'il a
  // accepté d'envoyer (Phase 6C). Le scan est rapide (regex pures) — pas
  // d'impact perçu.
  const leaks = detectLeaks(parsed.data.text);
  const leakSummary = summarize(leaks);

  if (leaks.length > 0 && !parsed.data.override) {
    // Cas BLOCKED : on bloque et on journalise.
    await prisma.securityEvent.create({
      data: {
        userId: session.user.id,
        route: "anonymize",
        decision: "BLOCKED",
        modelId: parsed.data.modelId,
        summary: leakSummary,
        findings: leaks,
      },
    });
    console.log(
      `[anonymize] user=${session.user.id} BLOCKED`,
      `model=${parsed.data.modelId}`,
      `summary=${JSON.stringify(leakSummary)}`
    );
    return new Response(
      JSON.stringify({
        blocked: true,
        leaks,
        summary: leakSummary,
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  if (leaks.length > 0 && parsed.data.override) {
    // Cas OVERRIDDEN : on procède mais on garde une trace.
    await prisma.securityEvent.create({
      data: {
        userId: session.user.id,
        route: "anonymize",
        decision: "OVERRIDDEN",
        modelId: parsed.data.modelId,
        summary: leakSummary,
        findings: leaks,
      },
    });
    console.log(
      `[anonymize] user=${session.user.id} OVERRIDDEN`,
      `model=${parsed.data.modelId}`,
      `summary=${JSON.stringify(leakSummary)}`
    );
  }

  // 4. Timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // 5. Appel avec fallback automatique
    const attempt = await tryWithFallback(
      parsed.data.modelId,
      async (modelInfo) => {
        return await generateText({
          model: modelInfo.model,
          system: SYSTEM_PROMPT,
          prompt: parsed.data.text,
          maxOutputTokens: 8000,
          abortSignal: controller.signal,
          tools: {
            soumettre_anonymisation: tool({
              description:
                "Soumets le résultat de l'anonymisation. À appeler exactement une fois avec le texte anonymisé complet et la liste de toutes les substitutions effectuées.",
              inputSchema: anonymizeSchema,
            }),
          },
          toolChoice: "required",
          stopWhen: stepCountIs(1),
          maxRetries: 0,  // ← AJOUT — fail-fast pour activer le fallback rapidement
        });
      }
    );

    clearTimeout(timeout);

    const { data: result, modelUsed, fellBack } = attempt;

    console.log(
      `[anonymize] user=${session.user.id}`,
      `model=${modelUsed.id}${fellBack ? ` (fallback)` : ""}`,
      `tokens=${result.usage.inputTokens}+${result.usage.outputTokens}=${result.usage.totalTokens}`,
      `finish=${result.finishReason}`,
      `toolCalls=${result.toolCalls.length}`
    );

    // 6. Récupérer l'appel d'outil
    const toolCall = result.toolCalls[0];
    if (!toolCall || toolCall.toolName !== "soumettre_anonymisation") {
      console.error(
        `[anonymize] user=${session.user.id} model=${modelUsed.id} no tool call. Raw text:`,
        result.text.substring(0, 500)
      );
      return new Response(
        JSON.stringify({
          error: `Le modèle ${modelUsed.label} n'a pas appelé l'outil attendu.`,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 7. Réponse incluant l'info de fallback
    const anonymizationData = toolCall.input as AnonymizeResult;

    return Response.json({
      ...anonymizationData,
      _meta: {
        modelUsed: modelUsed.id,
        modelLabel: modelUsed.label,
        fellBack,
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    console.error(`[anonymize] user=${session.user.id} error:`, error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
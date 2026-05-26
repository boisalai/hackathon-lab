import { z } from "zod";
import { generateText, tool, stepCountIs } from "ai";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SYSTEM_PROMPT, anonymizeSchema, type AnonymizeResult } from "@/lib/anonymize-schema";
import { tryWithFallback } from "@/lib/with-fallback";

const inputSchema = z.object({
  text: z.string().min(50).max(50_000),
  modelId: z.string(),
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

  // 3. Timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // 4. Appel avec fallback automatique
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

    // 5. Récupérer l'appel d'outil
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

    // 6. Réponse incluant l'info de fallback
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
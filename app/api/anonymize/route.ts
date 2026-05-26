import { z } from "zod";
import { generateText, tool, stepCountIs } from "ai";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getModel } from "@/lib/models-registry";
import { SYSTEM_PROMPT, anonymizeSchema } from "@/lib/anonymize-schema";

const inputSchema = z.object({
  text: z.string().min(50).max(50_000),
  modelId: z.string(),
});

const TIMEOUT_MS = 300_000; // 5 min — large pour couvrir Qwen 8B sur long texte

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

  // 3. Résoudre le modèle depuis le registre (fallback automatique si invalide)
  const modelInfo = getModel(parsed.data.modelId);

  // 4. Timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // 5. Appel avec tool calling (même pattern qu'avant, juste le modèle qui change)
    const result = await generateText({
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
    });

    clearTimeout(timeout);

    console.log(
      `[anonymize] user=${session.user.id}`,
      `model=${modelInfo.id}`,
      `tokens=${result.usage.inputTokens}+${result.usage.outputTokens}=${result.usage.totalTokens}`,
      `finish=${result.finishReason}`,
      `toolCalls=${result.toolCalls.length}`
    );

    const toolCall = result.toolCalls[0];
    if (!toolCall || toolCall.toolName !== "soumettre_anonymisation") {
      console.error(
        `[anonymize] user=${session.user.id} model=${modelInfo.id} no tool call. Raw text:`,
        result.text.substring(0, 500)
      );
      return new Response(
        JSON.stringify({
          error: `Le modèle ${modelInfo.label} n'a pas appelé l'outil attendu.`,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return Response.json(toolCall.input);
  } catch (error) {
    clearTimeout(timeout);
    console.error(
      `[anonymize] user=${session.user.id} model=${modelInfo.id} error:`,
      error
    );
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
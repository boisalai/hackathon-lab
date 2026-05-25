import { z } from "zod";
import { streamText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SYSTEM_PROMPT, judgmentSummarySchema } from "@/lib/judgment-schema";

const inputSchema = z.object({
  text: z.string().min(50).max(50_000),
});

const TIMEOUT_MS = 60_000; // 60 secondes — ~2x la latence observée

export async function POST(req: Request) {
  // 1. Authentification (mêmes garde-fous qu'en tRPC)
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Validation de l'input
  const body = await req.json();
  const parsed = inputSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.format() }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Streaming structuré
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const result = streamText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: SYSTEM_PROMPT,
    prompt: parsed.data.text,
    output: Output.object({ schema: judgmentSummarySchema }),
    abortSignal: controller.signal,  // ← coupe si timeout
    onFinish: ({ usage, finishReason }) => {
      clearTimeout(timeout);  // ← annule le timer dès que c'est fini
      console.log(
        `[judgment.summarize] user=${session.user.id}`,
        `tokens=${usage.inputTokens}+${usage.outputTokens}=${usage.totalTokens}`,
        `finish=${finishReason}`
      );
    },
    onError: ({ error }) => {
      clearTimeout(timeout);  // ← idem en cas d'erreur
      console.error(
        `[judgment.summarize] user=${session.user.id}`,
        "stream error:",
        error
      );
    },
  });

  // 4. Réponse en SSE compatible useObject
  return result.toTextStreamResponse();
}
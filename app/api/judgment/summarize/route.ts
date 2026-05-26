import { z } from "zod";
import { streamText, Output } from "ai";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getModel } from "@/lib/models-registry";
import {
  SYSTEM_PROMPT,
  judgmentSummarySchema,
} from "@/lib/judgment-schema";

const inputSchema = z.object({
  text: z.string().min(50).max(50_000),
  modelId: z.string(),
});

const TIMEOUT_MS = 60_000;

export async function POST(req: Request) {
  // 1. Auth
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Validation
  const body = await req.json();
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.format() }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Résoudre le modèle (fallback automatique si invalide)
  const modelInfo = getModel(parsed.data.modelId);

  // 4. Timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // 5. Streaming structuré
  const result = streamText({
    model: modelInfo.model,
    system: SYSTEM_PROMPT,
    prompt: parsed.data.text,
    output: Output.object({ schema: judgmentSummarySchema }),
    abortSignal: controller.signal,
    onFinish: ({ usage, finishReason }) => {
      clearTimeout(timeout);
      console.log(
        `[judgment.summarize] user=${session.user.id}`,
        `model=${modelInfo.id}`,
        `tokens=${usage.inputTokens}+${usage.outputTokens}=${usage.totalTokens}`,
        `finish=${finishReason}`
      );
    },
    onError: ({ error }) => {
      clearTimeout(timeout);
      console.error(
        `[judgment.summarize] user=${session.user.id}`,
        `model=${modelInfo.id}`,
        "stream error:",
        error
      );
    },
  });

  return result.toTextStreamResponse();
}
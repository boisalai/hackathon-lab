import { z } from "zod";
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/init";
import { SYSTEM_PROMPT, judgmentSummarySchema } from "@/lib/judgment-schema";
import { qwen3_8b } from "@/lib/local-llm";

export const judgmentRouter = createTRPCRouter({
  summarize: protectedProcedure
    .input(z.object({ text: z.string().min(50).max(50_000) }))
    .mutation(async ({ input }) => {
      const result = await generateText({
        model: anthropic("claude-haiku-4-5-20251001"),
        system: SYSTEM_PROMPT,
        prompt: input.text,
        output: Output.object({ schema: judgmentSummarySchema }),
      });

      return { summary: result.output };
    }),
});
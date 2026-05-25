import { z } from "zod";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/init";

export const judgmentRouter = createTRPCRouter({
  summarize: protectedProcedure
    .input(
      z.object({
        text: z.string().min(50).max(50_000),
      })
    )
    .mutation(async ({ input }) => {
      const result = await generateText({
        model: anthropic("claude-haiku-4-5-20251001"),
        prompt: input.text,
      });

      return { summary: result.text };
    }),
});
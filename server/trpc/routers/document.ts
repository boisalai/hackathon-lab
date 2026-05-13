import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/trpc/init";

export const documentRouter = createTRPCRouter({
  /**
   * Récupère tous les documents, du plus récent au plus ancien.
   */
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.document.findMany({
      orderBy: { createdAt: "desc" },
    });
  }),

  /**
   * Crée un nouveau document.
   * Le schéma Zod valide les entrées avant que la procédure soit appelée.
   */
  create: publicProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        content: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.document.create({
        data: {
          title: input.title,
          content: input.content,
        },
      });
    }),
});
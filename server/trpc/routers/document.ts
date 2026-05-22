import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/init";

export const documentRouter = createTRPCRouter({
  /**
   * Récupère tous les documents, du plus récent au plus ancien.
   * Protégée : seuls les utilisateurs connectés y ont accès.
   *
   * En 3E, on filtrera par propriétaire (ctx.session.user.id).
   * Pour l'instant, tous les utilisateurs connectés voient tous les documents.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.document.findMany({
      orderBy: { createdAt: "desc" },
    });
  }),

  /**
   * Crée un nouveau document.
   * Protégée : seuls les utilisateurs connectés peuvent créer.
   *
   * En 3E, on enregistrera ctx.session.user.id comme propriétaire du document.
   */
  create: protectedProcedure
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
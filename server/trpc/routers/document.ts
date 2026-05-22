import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/init";

export const documentRouter = createTRPCRouter({
  /**
   * Récupère uniquement les documents de l'utilisateur connecté,
   * du plus récent au plus ancien.
   *
   * Le filtre `where: { userId: ctx.session.user.id }` est appliqué
   * côté serveur — un utilisateur malveillant ne peut pas le contourner.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.document.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "desc" },
    });
  }),

  /**
   * Crée un nouveau document rattaché à l'utilisateur connecté.
   *
   * On force `userId = ctx.session.user.id` côté serveur.
   * Le client ne peut PAS spécifier un autre userId — la procédure
   * n'accepte que `title` et `content` dans son schéma Zod.
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
          userId: ctx.session.user.id,
        },
      });
    }),
});
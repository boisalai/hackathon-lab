import { createTRPCRouter } from "@/server/trpc/init";
import { documentRouter } from "@/server/trpc/routers/document";

/**
 * Routeur racine : agrège tous les routeurs de l'application.
 * Au fur et à mesure qu'on ajoute des fonctionnalités, on ajoutera
 * de nouveaux routeurs ici (user, search, anonymize, etc.).
 */
export const appRouter = createTRPCRouter({
  document: documentRouter,
});

/**
 * Type du routeur racine. C'est CE type qui sera importé côté client
 * pour fournir l'auto-complétion et la sécurité de typage bout-en-bout.
 * On n'importe jamais le routeur lui-même côté client — uniquement son type.
 */
export type AppRouter = typeof appRouter;
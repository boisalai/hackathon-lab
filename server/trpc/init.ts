import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { cache } from "react";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * Contexte tRPC : objets disponibles dans toutes les procédures.
 *
 * On expose :
 * - `prisma` : le client typé pour la base de données
 * - `session` : la session de l'utilisateur courant, ou null s'il n'est pas connecté
 *
 * Better Auth lit la session depuis les cookies de la requête HTTP en cours.
 * `headers()` est la fonction Next.js qui donne accès aux en-têtes de cette requête.
 */
export const createTRPCContext = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return { prisma, session };
});

/**
 * Initialisation de tRPC.
 */
const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create({
    transformer: superjson,
  });

/**
 * Helpers exportés.
 */
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * publicProcedure : accessible à tous, connecté ou non.
 * Utilise-la pour les endpoints publics (signup public, page d'accueil publique, etc.)
 */
export const publicProcedure = t.procedure;

/**
 * protectedProcedure : refuse les requêtes non authentifiées.
 *
 * Le middleware `.use(...)` intercepte chaque appel avant la procédure :
 * - Si `ctx.session` est null/undefined → throw UNAUTHORIZED (HTTP 401)
 * - Sinon → enrichit le contexte avec un `ctx.session` non-nullable,
 *   ce qui permet aux procédures de l'utiliser sans vérifier sa présence.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Tu dois être connecté pour effectuer cette action.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      // À partir d'ici, TypeScript sait que session.user existe (plus de null)
      session: ctx.session,
    },
  });
});
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Contexte tRPC : objets disponibles dans toutes les procédures.
 * Pour l'instant, on n'expose que Prisma. Plus tard on y ajoutera
 * l'utilisateur authentifié (sous-phase 3).
 */
export const createTRPCContext = cache(async () => {
  return { prisma };
});

/**
 * Initialisation de tRPC.
 * - context : le type du contexte (inféré depuis createTRPCContext)
 * - transformer : superjson pour sérialiser Date, BigInt, etc.
 */
const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create({
    transformer: superjson,
  });

/**
 * Helpers exportés pour construire les routeurs et procédures.
 */
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;
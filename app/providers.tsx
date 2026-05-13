"use client";

import { TRPCReactProvider } from "@/lib/trpc/client";

/**
 * Enveloppe l'application avec tous les Providers nécessaires côté client.
 * Pour l'instant : tRPC + React Query (via TRPCReactProvider).
 * Plus tard, on y ajoutera l'authentification, les thèmes, etc.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <TRPCReactProvider>{children}</TRPCReactProvider>;
}
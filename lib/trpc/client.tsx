"use client";

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useState } from "react";
import superjson from "superjson";
import type { AppRouter } from "@/server/trpc/root";
import { makeQueryClient } from "@/lib/trpc/query-client";

/**
 * Crée le contexte tRPC + les hooks associés.
 * - `TRPCProvider` : le composant à mettre haut dans l'arbre React
 * - `useTRPC` : le hook à utiliser dans les composants pour appeler les procédures
 */
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

/**
 * Singleton pour le QueryClient côté navigateur uniquement.
 * Côté serveur, on en veut un neuf à chaque requête.
 */
let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Côté serveur : toujours un nouveau client
    return makeQueryClient();
  }
  // Côté navigateur : un seul client partagé pour toute la session
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

/**
 * Détermine l'URL absolue de l'API tRPC.
 * - Navigateur : URL relative (le navigateur sait où il est)
 * - Serveur (SSR) : URL absolue obligatoire
 */
function getUrl() {
  const base = (() => {
    if (typeof window !== "undefined") return "";
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return `http://localhost:${process.env.PORT ?? 3000}`;
  })();
  return `${base}/api/trpc`;
}

/**
 * Provider à utiliser dans le layout racine pour rendre tRPC disponible
 * dans toute l'application.
 */
export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    // On instancie le client tRPC une seule fois grâce à useState(() => ...)
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          transformer: superjson,
          url: getUrl(),
        }),
      ],
    })
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
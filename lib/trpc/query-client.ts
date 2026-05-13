import {
  QueryClient,
  defaultShouldDehydrateQuery,
} from "@tanstack/react-query";
import superjson from "superjson";

/**
 * Crée un QueryClient configuré pour fonctionner avec tRPC + superjson.
 *
 * Pourquoi une fonction et non une constante ?
 * Côté serveur, on veut un nouveau QueryClient par requête (pour éviter
 * que les données d'un utilisateur fuient vers un autre).
 * Côté client, on en veut un seul, partagé.
 * On centralise la création ici et on gérera ce comportement dans client.tsx.
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Durée pendant laquelle une donnée reste "fraîche" : 30s.
        // En dessous de ce délai, React Query ne refetch pas inutilement.
        staleTime: 30 * 1000,
      },
      dehydrate: {
        // Permet à React Query de sérialiser les requêtes en cours
        // (utile pour le streaming SSR). superjson gère les Date, BigInt, etc.
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
import { getModel, type ModelInfo, MODELS } from "@/lib/models-registry";

/**
 * Détecte si une erreur indique que le serveur local est injoignable.
 * On ne fait fallback que pour les erreurs réseau, pas pour les erreurs de validation
 * ou de contenu (qui doivent remonter à l'utilisateur).
 */
function isLocalServerUnreachable(error: unknown): boolean {
  // Fonction récursive qui inspecte l'erreur et ses causes imbriquées
  function inspect(err: unknown, depth = 0): boolean {
    if (depth > 5 || !err) return false;

    // Vérifier le code direct (ECONNREFUSED, etc.)
    if (typeof err === "object" && err !== null) {
      const obj = err as Record<string, unknown>;
      
      if (obj.code === "ECONNREFUSED" || obj.code === "ENOTFOUND") {
        return true;
      }

      // Vérifier le message
      const message = typeof obj.message === "string" 
        ? obj.message.toLowerCase() 
        : "";
      
      if (
        message.includes("econnrefused") ||
        message.includes("enotfound") ||
        message.includes("cannot connect to api") ||
        message.includes("fetch failed") ||
        message.includes("connection refused")
      ) {
        return true;
      }

      // Récursion sur cause et errors (AggregateError)
      if (obj.cause && inspect(obj.cause, depth + 1)) return true;
      if (Array.isArray(obj.errors)) {
        for (const e of obj.errors) {
          if (inspect(e, depth + 1)) return true;
        }
      }
      if (Array.isArray(obj.lastError) || obj.lastError) {
        if (inspect(obj.lastError, depth + 1)) return true;
      }
    }

    return false;
  }

  return inspect(error);
}

export type AttemptResult<T> = {
  data: T;
  modelUsed: ModelInfo;
  fellBack: boolean;
};

/**
 * Tente l'opération avec le modèle demandé.
 * Si le modèle a un fallbackTo défini ET que l'erreur indique un serveur local injoignable,
 * réessaie avec le modèle de fallback.
 *
 * Toute autre erreur (validation, contenu, timeout) est propagée telle quelle.
 */
export async function tryWithFallback<T>(
  modelId: string,
  operation: (model: ModelInfo) => Promise<T>
): Promise<AttemptResult<T>> {
  const primary = getModel(modelId);

  try {
    const data = await operation(primary);
    return { data, modelUsed: primary, fellBack: false };
  } catch (error) {
    // Pas de fallback configuré ou erreur non liée au réseau → propager
    if (!primary.fallbackTo || !isLocalServerUnreachable(error)) {
      throw error;
    }

    const fallback = MODELS[primary.fallbackTo];
    if (!fallback) {
      throw error;
    }

    console.log(
      `[fallback] ${primary.id} unreachable, falling back to ${fallback.id}`
    );

    // Deuxième tentative — si elle échoue aussi, on propage l'erreur
    const data = await operation(fallback);
    return { data, modelUsed: fallback, fellBack: true };
  }
}
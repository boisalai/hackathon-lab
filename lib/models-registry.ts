import { anthropic } from "@ai-sdk/anthropic";
import { qwen3_8b } from "@/lib/local-llm";
import type { LanguageModel } from "ai";

export type ModelProvider = "local" | "anthropic";

export type ModelInfo = {
  id: string;
  label: string;
  provider: ModelProvider;
  description: string;
  available: boolean; // Si false, l'option est grisée dans le sélecteur
  model: LanguageModel;
};

/**
 * Catalogue des modèles disponibles.
 * Pour ajouter un modèle local : démarrer mlx_lm.server avec --model,
 * puis ajouter une entrée ici avec available: true.
 */
export const MODELS: Record<string, ModelInfo> = {
  "qwen3-8b-local": {
    id: "qwen3-8b-local",
    label: "Qwen 3 8B (local)",
    provider: "local",
    description: "Rapide et privé. Texte court à moyen.",
    available: true,
    model: qwen3_8b,
  },
  "qwen3.6-27b-local": {
    id: "qwen3.6-27b-local",
    label: "Qwen 3.6 27B (local)",
    provider: "local",
    description: "Plus capable. Nécessite mlx_lm.server avec ce modèle.",
    available: false, // Pas chargé pour l'instant
    model: qwen3_8b, // Placeholder — sera remplacé quand on lancera un second serveur
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    description: "Rapide, économique. Bon défaut cloud.",
    available: true,
    model: anthropic("claude-haiku-4-5-20251001"),
  },
  "claude-sonnet-4-6": {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    description: "Équilibré. Bon pour raisonnement structuré.",
    available: true,
    model: anthropic("claude-sonnet-4-6"),
  },
  "claude-opus-4-7": {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    provider: "anthropic",
    description: "Phare actuel. Tâches complexes. Coût le plus élevé.",
    available: true,
    model: anthropic("claude-opus-4-7"),
  },
};

export const DEFAULT_MODEL_ID = "qwen3-8b-local";

export function getModel(id: string): ModelInfo {
  const model = MODELS[id];
  if (!model || !model.available) {
    return MODELS[DEFAULT_MODEL_ID];
  }
  return model;
}

// Liste affichable pour le sélecteur UI
export const MODEL_LIST = Object.values(MODELS);
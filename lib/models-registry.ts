import { anthropic } from "@ai-sdk/anthropic";
import { qwen3_8b } from "@/lib/local-llm";
import type { LanguageModel } from "ai";

export type ModelProvider = "local" | "anthropic";

export type ModelCapability =
  | "streaming-structured" // Supporte streamText + Output.object (response_format json_schema)
  | "tool-calling"; // Supporte les outils (presque tous les modèles modernes)

export type ModelInfo = {
  id: string;
  label: string;
  provider: ModelProvider;
  description: string;
  available: boolean;
  capabilities: ModelCapability[];
  fallbackTo?: string;  // ← NOUVEAU : id du modèle de remplacement si celui-ci échoue
  model: LanguageModel;
};

export const MODELS: Record<string, ModelInfo> = {
  "qwen3-8b-local": {
    id: "qwen3-8b-local",
    label: "Qwen 3 8B (local)",
    provider: "local",
    description: "Rapide et privé. Texte court à moyen.",
    available: true,
    capabilities: ["tool-calling"], // PAS de streaming structuré
    fallbackTo: "claude-haiku-4-5",  // ← AJOUT
    model: qwen3_8b,
  },
  "qwen3.6-27b-local": {
    id: "qwen3.6-27b-local",
    label: "Qwen 3.6 27B (local)",
    provider: "local",
    description: "Plus capable. Nécessite mlx_lm.server avec ce modèle.",
    available: false,
    capabilities: ["tool-calling"],
    fallbackTo: "claude-haiku-4-5",  // ← AJOUT
    model: qwen3_8b,
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    description: "Rapide, économique. Bon défaut cloud.",
    available: true,
    capabilities: ["streaming-structured", "tool-calling"],
    model: anthropic("claude-haiku-4-5-20251001"),
  },
  "claude-sonnet-4-6": {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    description: "Équilibré. Bon pour raisonnement structuré.",
    available: true,
    capabilities: ["streaming-structured", "tool-calling"],
    model: anthropic("claude-sonnet-4-6"),
  },
  "claude-opus-4-7": {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    provider: "anthropic",
    description: "Phare actuel. Tâches complexes. Coût le plus élevé.",
    available: true,
    capabilities: ["streaming-structured", "tool-calling"],
    model: anthropic("claude-opus-4-7"),
  },
};

export const DEFAULT_MODEL_ID = "claude-haiku-4-5";

export function getModel(id: string): ModelInfo {
  const model = MODELS[id];
  if (!model || !model.available) {
    return MODELS[DEFAULT_MODEL_ID];
  }
  return model;
}

export const MODEL_LIST = Object.values(MODELS);

/**
 * Filtre les modèles selon les capacités requises.
 * Usage : MODELS_WITH("streaming-structured") pour les modèles compatibles avec
 * un endpoint streaming + sortie structurée.
 */
export function modelsWith(...capabilities: ModelCapability[]): ModelInfo[] {
  return MODEL_LIST.filter((m) =>
    capabilities.every((cap) => m.capabilities.includes(cap))
  );
}
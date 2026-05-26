import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const LOCAL_LLM_BASE_URL =
  process.env.LOCAL_LLM_BASE_URL ?? "http://localhost:8080/v1";

export const localLlm = createOpenAICompatible({
  name: "local-mlx",
  baseURL: LOCAL_LLM_BASE_URL,
  apiKey: "not-needed",
  // mlx_lm.server n'implémente pas response_format json_schema
  // → forcer le mode prompting (le SDK injecte le schéma dans le prompt
  //   et parse la réponse texte)
  supportsStructuredOutputs: false,
});

export const qwen3_8b = localLlm("default_model");

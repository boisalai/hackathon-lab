import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const LOCAL_LLM_BASE_URL =
  process.env.LOCAL_LLM_BASE_URL ?? "http://localhost:8080/v1";

export const localLlm = createOpenAICompatible({
  name: "local-mlx",
  baseURL: LOCAL_LLM_BASE_URL,
  apiKey: "not-needed",
});

export const qwen3_8b = localLlm("default_model");
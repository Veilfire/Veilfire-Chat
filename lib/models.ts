import type { ModelConfig } from "./chatTypes";

export const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: "x-ai/grok-4.1-fast",
    label: "Grok 4.1 fast (free)",
    description: "Fast, free general model via OpenRouter",
    contextWindow: 2_000_000,
    origin: "default",
  },
  {
    id: "qwen/qwen3-235b-a22b:free",
    label: "Qwen3 235B A22B (free)",
    description: "Fast, free general model via OpenRouter",
    contextWindow: 41_000,
    origin: "default",
  },
  {
    id: "google/gemma-3-27b-it:free",
    label: "Google Gemma 3.27B (free)",
    description: "Fast, free general model via OpenRouter",
    contextWindow: 131_000,
    origin: "default",
  },
  {
    id: "openai/gpt-4.1-mini",
    label: "GPT-4.1 mini",
    description: "Fast, affordable general model via OpenRouter",
    contextWindow: 128_000,
    origin: "default",
  },
  {
    id: "openai/gpt-4.1",
    label: "GPT-4.1",
    description: "Stronger general model",
    contextWindow: 128_000,
    origin: "default",
  },
  {
    id: "anthropic/claude-3.7-sonnet",
    label: "Claude 3.7 Sonnet",
    description: "Anthropic Claude Sonnet via OpenRouter",
    contextWindow: 200_000,
    origin: "default",
  },
];

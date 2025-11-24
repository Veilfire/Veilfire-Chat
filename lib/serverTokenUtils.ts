import type { ChatMessage, ContextConfig } from "./chatTypes";
import {
  encoding_for_model,
  get_encoding,
  type Tiktoken,
  type TiktokenModel,
} from "tiktoken";

function normaliseModelId(modelId: string): string {
  if (!modelId) return "gpt-4o-mini";
  const parts = modelId.split("/");
  const last = parts[parts.length - 1];
  return last || "gpt-4o-mini";
}

export function applyContextStrategyServer(
  messages: ChatMessage[],
  config: ContextConfig,
  modelId: string
): ChatMessage[] {
  if (config.strategy === "full") return messages;

  if (config.strategy === "lastN") {
    const n = config.lastN ?? 10;
    return messages.slice(-n);
  }

  // approxTokens using real tiktoken counts
  const maxTokens = config.maxApproxTokens ?? 4096;
  const reversed = [...messages].reverse();
  const result: ChatMessage[] = [];

  const modelName = normaliseModelId(modelId);

  let enc: Tiktoken | null = null;
  try {
    try {
      // Normalised modelId may not be a known tiktoken model at compile time,
      // but at runtime encoding_for_model will throw and we fall back.
      enc = encoding_for_model(modelName as TiktokenModel);
    } catch {
      enc = get_encoding("o200k_base");
    }

    let total = 0;

    for (const msg of reversed) {
      const tokens = enc.encode(msg.content).length;
      if (total + tokens > maxTokens) break;
      result.push(msg);
      total += tokens;
    }

    return result.reverse();
  } finally {
    if (enc) {
      enc.free();
    }
  }
}

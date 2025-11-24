import type { ChatMessage, ContextConfig } from "./chatTypes";

// Lightweight approximate token counter for client-only usage.
// For server-side trimming we use real tiktoken in serverTokenUtils.ts.
function approxTokenCount(text: string): number {
  if (!text.trim()) return 0;
  const words = text.trim().split(/\s+/g).length;
  return Math.round(words * 1.3);
}

export function applyContextStrategy(
  messages: ChatMessage[],
  config: ContextConfig
): ChatMessage[] {
  if (config.strategy === "full") return messages;

  if (config.strategy === "lastN") {
    const n = config.lastN ?? 10;
    return messages.slice(-n);
  }

  const maxTokens = config.maxApproxTokens ?? 4096;
  const reversed = [...messages].reverse();
  const result: ChatMessage[] = [];
  let total = 0;

  for (const msg of reversed) {
    const tokens = approxTokenCount(msg.content);
    if (total + tokens > maxTokens) break;
    result.push(msg);
    total += tokens;
  }

  return result.reverse();
}

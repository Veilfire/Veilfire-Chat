import type { ChatMessage, ContextConfig } from "./chatTypes";

export interface ChatLog {
  id: string;
  userId: string;
  conversationId: string | null;
  createdAt: number;
  modelId: string;
  request: {
    systemPrompt: string;
    plannerPrompt: string;
    reflectorPrompt: string;
    scratchpad?: string;
    contextConfig: ContextConfig;
    messages: ChatMessage[];
    trimmedMessages: ChatMessage[];
  };
  response: {
    content: string;
  };
}

export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
}

export type ContextStrategy = "full" | "lastN" | "approxTokens";

export interface ContextConfig {
  strategy: ContextStrategy;
  lastN?: number;
  maxApproxTokens?: number;
}

export interface ModelConfig {
  id: string;
  label: string;
  description?: string;
  contextWindow?: number;
  provider?: string;
  origin?: "default" | "custom";
}

export interface ConversationSettings {
  modelId: string;
  systemPrompt: string;
  reflectorPrompt: string;
  plannerPrompt: string;
  context: ContextConfig;
  temperature: number;
  stream: boolean;
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  textPreview?: string;
}

export interface Conversation {
  id: string;
  userId?: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  settings: ConversationSettings;
}

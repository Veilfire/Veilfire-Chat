import OpenAI from "openai";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import clientPromise from "@/lib/mongodb";
import { applyContextStrategyServer } from "@/lib/serverTokenUtils";
import type { ChatMessage, ContextConfig } from "@/lib/chatTypes";
import type { ChatLog } from "@/lib/logTypes";

export const runtime = "nodejs";

const DB_NAME = process.env.MONGODB_DB || "veilfire_chat";

interface ChatRequestBody {
  conversationId?: string;
  messages: ChatMessage[];
  modelId: string;
  systemPrompt?: string;
  reflectorPrompt?: string;
  plannerPrompt?: string;
  contextConfig: ContextConfig;
  temperature?: number;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | null;

  if (!session || !user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = user.id as string;

  const mongoClient = await clientPromise;
  const db = mongoClient.db(DB_NAME);

  const settingsDoc = (await db
    .collection("user_settings")
    .findOne({ userId })) as { openRouterApiKey?: string | null } | null;

  const userKey = settingsDoc?.openRouterApiKey ?? null;
  const apiKeyToUse = userKey || process.env.OPENROUTER_API_KEY;

  if (!apiKeyToUse) {
    return new Response("OPENROUTER_API_KEY not configured", { status: 500 });
  }

  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: apiKeyToUse,
    defaultHeaders: {
      "HTTP-Referer": "https://veilfire.io",
      "X-Title": "Veilfire Chat",
    },
  });

  const body = (await req.json()) as ChatRequestBody;

  const {
    conversationId = null,
    messages,
    modelId,
    systemPrompt = "",
    reflectorPrompt = "",
    plannerPrompt = "",
    contextConfig,
    temperature = 0.2,
  } = body;

  const trimmedMessages = applyContextStrategyServer(
    messages,
    contextConfig,
    modelId
  );

  const systemParts: string[] = [];
  if (systemPrompt.trim()) systemParts.push(systemPrompt.trim());
  if (plannerPrompt.trim())
    systemParts.push(`Planner instructions:\n${plannerPrompt.trim()}`);
  if (reflectorPrompt.trim())
    systemParts.push(
      `Reflection / self-critique instructions:\n${reflectorPrompt.trim()}`
    );

  const combinedSystem = systemParts.join("\n\n---\n\n");

  const openaiMessages = [
    ...(combinedSystem
      ? [{ role: "system", content: combinedSystem } as const]
      : []),
    ...trimmedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const encoder = new TextEncoder();

  const stream = await client.chat.completions.create({
    model: modelId,
    messages: openaiMessages,
    temperature,
    stream: true,
  });
  let fullContent = "";

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            fullContent += delta;
            controller.enqueue(encoder.encode(delta));
          }
        }
        controller.close();

        // After streaming completes, write log to MongoDB and persist
        // the conversation messages so they survive reloads.
        try {
          const log: Omit<ChatLog, "id"> = {
            userId,
            conversationId,
            createdAt: Date.now(),
            modelId,
            request: {
              systemPrompt,
              plannerPrompt,
              reflectorPrompt,
              contextConfig,
              messages,
              trimmedMessages,
            },
            response: {
              content: fullContent,
            },
          };

          await db.collection("chat_logs").insertOne(log);

          if (conversationId) {
            const fullMessages: ChatMessage[] = [
              ...messages,
              {
                id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                role: "assistant",
                content: fullContent,
                createdAt: Date.now(),
              },
            ];

            await db.collection("conversations").updateOne(
              { userId, id: conversationId },
              {
                $set: {
                  messages: fullMessages,
                  updatedAt: Date.now(),
                },
              }
            );
          }
        } catch (err) {
          console.error("Failed to write chat log or update conversation", err);
        }
      } catch (err) {
        console.error("Streaming error", err);
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

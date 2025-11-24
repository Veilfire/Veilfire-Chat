import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import clientPromise from "@/lib/mongodb";
import type { Conversation } from "@/lib/chatTypes";
import { randomUUID } from "crypto";

const DB_NAME = process.env.MONGODB_DB || "veilfire_chat";

type ConversationDoc = Omit<Conversation, "id"> & {
  id: string;
};

function formatDefaultConversationTitle(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const yyyy = date.getFullYear();
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `Chat ${mm}-${dd}-${yyyy} ${hh}:${min}`;
}

export async function GET(_req: NextRequest) {
  void _req;
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | null;

  if (!session || !user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const userId = user.id as string;

  const client = await clientPromise;
  const db = client.db(DB_NAME);
  let docs = await db
    .collection<ConversationDoc>("conversations")
    .find({ userId })
    .sort({ updatedAt: -1 })
    .toArray();

  // Fallback for legacy conversations that predate per-user storage and
  // therefore have no userId field yet.
  if (docs.length === 0) {
    docs = await db
      .collection<ConversationDoc>("conversations")
      .find({ userId: { $exists: false } })
      .sort({ updatedAt: -1 })
      .toArray();
  }

  const conversations: Conversation[] = docs.map((doc) => ({
    id: doc.id,
    userId: doc.userId ?? userId,
    title: doc.title,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    messages: doc.messages ?? [],
    settings: doc.settings,
  }));

  return NextResponse.json(conversations);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | null;

  if (!session || !user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const userId = user.id as string;

  const rawBody = await req.json().catch(() => null);
  const body =
    rawBody && typeof rawBody === "object"
      ? (rawBody as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const nowDate = new Date();
  const title: string =
    typeof body.title === "string" && body.title
      ? body.title
      : formatDefaultConversationTitle(nowDate);
  const now = nowDate.getTime();

  const defaultSettings = {
    modelId: "openai/gpt-4.1-mini",
    systemPrompt: "You are a helpful assistant.",
    reflectorPrompt: "",
    plannerPrompt: "",
    context: {
      strategy: "full" as const,
      lastN: 20,
      maxApproxTokens: 6000,
    },
    temperature: 0.2,
    stream: true,
  };

  const conv: Conversation = {
    id: randomUUID(),
    userId,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    settings: defaultSettings,
  };

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  await db.collection("conversations").insertOne({
    userId,
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messages: conv.messages,
    settings: conv.settings,
  });

  return NextResponse.json(conv, { status: 201 });
}

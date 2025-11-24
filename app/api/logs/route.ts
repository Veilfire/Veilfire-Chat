import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import clientPromise from "@/lib/mongodb";
import type { ChatLog } from "@/lib/logTypes";

const DB_NAME = process.env.MONGODB_DB || "veilfire_chat";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | null;

  if (!session || !user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const userId = user.id as string;
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  const query: { userId: string; conversationId?: string } = { userId };
  if (conversationId) {
    query.conversationId = conversationId;
  }

  const docs = await db
    .collection("chat_logs")
    .find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();

  const logs: ChatLog[] = docs.map((doc) => {
    const d = doc as unknown as {
      _id: { toString(): string };
      userId: string;
      conversationId?: string | null;
      createdAt: number;
      modelId: string;
      request: ChatLog["request"];
      response: ChatLog["response"];
    };

    return {
      id: d._id.toString(),
      userId: d.userId,
      conversationId: d.conversationId ?? null,
      createdAt: d.createdAt,
      modelId: d.modelId,
      request: d.request,
      response: d.response,
    };
  });

  return NextResponse.json(logs);
}

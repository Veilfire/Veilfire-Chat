import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import clientPromise from "@/lib/mongodb";
import type { Conversation } from "@/lib/chatTypes";

const DB_NAME = process.env.MONGODB_DB || "veilfire_chat";

interface RouteParams {
  params: { id: string };
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | null;

  if (!session || !user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const userId = user.id as string;
  const { id } = params;

  const conv = (await req.json()) as Conversation;

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  await db.collection("conversations").updateOne(
    { userId, id },
    {
      $set: {
        title: conv.title,
        messages: conv.messages,
        settings: conv.settings,
        updatedAt: conv.updatedAt ?? Date.now(),
      },
    },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | null;

  if (!session || !user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const userId = user.id as string;
  const { id } = params;

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  await db.collection("conversations").deleteOne({ userId, id });

  return NextResponse.json({ ok: true });
}

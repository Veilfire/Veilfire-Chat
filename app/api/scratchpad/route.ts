import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import clientPromise from "@/lib/mongodb";

const DB_NAME = process.env.MONGODB_DB || "veilfire_chat";
const SCRATCHPAD_COLLECTION = "scratchpads";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | null;

  if (!session || !user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const userId = user.id as string;
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");

  if (!conversationId) {
    return NextResponse.json({ content: "" });
  }

  const mongoClient = await clientPromise;
  const db = mongoClient.db(DB_NAME);

  const doc = (await db
    .collection(SCRATCHPAD_COLLECTION)
    .findOne({ userId, conversationId })) as { content?: string | null } | null;

  const content =
    (doc && typeof doc.content === "string" ? doc.content : "") || "";

  return NextResponse.json({ content });
}

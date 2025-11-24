import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import clientPromise from "@/lib/mongodb";
import type { ChatMessage } from "@/lib/chatTypes";

const DB_NAME = process.env.MONGODB_DB || "veilfire_chat";

interface RouteParams {
  params: { id: string };
}

interface SummarizeTitleBody {
  modelId: string;
  messages: ChatMessage[];
}

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | null;

  if (!session || !user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const userId = user.id as string;
  const { id } = params;

  const mongoClient = await clientPromise;
  const db = mongoClient.db(DB_NAME);

  // Ensure the conversation belongs to this user
  const convDoc = await db
    .collection("conversations")
    .findOne({ userId, id });

  if (!convDoc) {
    return new NextResponse("Conversation not found", { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as SummarizeTitleBody;
  const { modelId, messages } = body;

  if (!modelId || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "modelId and messages are required" },
      { status: 400 }
    );
  }

  const settingsDoc = (await db
    .collection("user_settings")
    .findOne({ userId })) as { openRouterApiKey?: string | null } | null;

  const userKey = settingsDoc?.openRouterApiKey ?? null;
  const apiKeyToUse = userKey || process.env.OPENROUTER_API_KEY;

  if (!apiKeyToUse) {
    return new NextResponse("OPENROUTER_API_KEY not configured", {
      status: 500,
    });
  }

  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: apiKeyToUse,
    defaultHeaders: {
      "HTTP-Referer": "https://veilfire.io",
      "X-Title": "Veilfire Chat",
    },
  });

  const lastMessages = messages.slice(-8);
  const conversationText = lastMessages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const completion = await client.chat.completions.create({
    model: modelId,
    messages: [
      {
        role: "system",
        content:
          "You write short, descriptive chat titles. Given a conversation, respond with a concise 2-5 word title capturing the main topic. Do not include surrounding quotes or extra commentary.",
      },
      {
        role: "user",
        content: `Conversation messages (most recent first):\n${conversationText}\n\nRespond with only the title:`,
      },
    ],
    max_tokens: 32,
    temperature: 0.2,
  });

  let rawTitle = completion.choices[0]?.message?.content?.trim() ?? "";

  if (!rawTitle) {
    return NextResponse.json({ title: null });
  }

  // Sanitize: collapse whitespace, strip wrapping quotes, remove trailing period.
  rawTitle = rawTitle.replace(/^["'\s]+|["'\s]+$/g, "");
  rawTitle = rawTitle.replace(/\s+/g, " ");
  rawTitle = rawTitle.replace(/\.$/, "");

	await db.collection("conversations").updateOne(
		{ userId, id },
		{
			$set: {
				title: rawTitle,
				updatedAt: Date.now(),
			},
		}
	);

	return NextResponse.json({ title: rawTitle });
}

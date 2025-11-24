import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import clientPromise from "@/lib/mongodb";
import type { ModelConfig } from "@/lib/chatTypes";

const DB_NAME = process.env.MONGODB_DB || "llm_chat_mvp";

interface OpenRouterModelsResponse {
  data?: unknown;
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

  const settingsDoc = (await db
    .collection("user_settings")
    .findOne({ userId })) as { openRouterApiKey?: string | null } | null;

  const userKey = settingsDoc?.openRouterApiKey ?? null;
  const apiKey = userKey || process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return new NextResponse("Missing OpenRouter API key", { status: 400 });
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://veilfire.io",
        "X-Title": "Veilfire Chat",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return new NextResponse(
        text || `Failed to fetch models from OpenRouter: ${res.status}`,
        { status: 502 }
      );
    }

    const json = (await res.json()) as OpenRouterModelsResponse;
    const rawModels = Array.isArray(json.data) ? json.data : [];

    const models: ModelConfig[] = rawModels
      .map((m): ModelConfig | null => {
        if (!m || typeof m !== "object") {
          return null;
        }

        const obj = m as Record<string, unknown>;

        const id = typeof obj.id === "string" ? obj.id : "";
        if (!id) return null;

        const labelCandidate =
          (typeof obj.name === "string" && obj.name) ||
          (typeof obj.display_name === "string" && obj.display_name) ||
          id;

        const description =
          typeof obj.description === "string" ? obj.description : undefined;

        const contextWindow =
          typeof obj.context_length === "number"
            ? obj.context_length
            : undefined;

        const provider = id.includes("/") ? id.split("/")[0] : undefined;

        const model: ModelConfig = {
          id,
          label: labelCandidate,
          description,
          contextWindow,
          provider,
          origin: "custom",
        };

        return model;
      })
      .filter((m: ModelConfig | null): m is ModelConfig => m !== null);

    return NextResponse.json({ models });
  } catch {
    return new NextResponse("Error contacting OpenRouter", { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import clientPromise from "@/lib/mongodb";
import type { ModelConfig } from "@/lib/chatTypes";

const DB_NAME = process.env.MONGODB_DB || "llm_chat_mvp";

interface UserSettingsDoc {
  userId: string;
  openRouterApiKey?: string | null;
  customModels?: ModelConfig[];
}

function sanitize(doc: UserSettingsDoc | null) {
  if (!doc) {
    return {
      hasApiKey: false,
      apiKeyLast4: null as string | null,
      customModels: [] as ModelConfig[],
    };
  }

  const key = doc.openRouterApiKey ?? null;
  const last4 = key && key.length >= 4 ? key.slice(-4) : null;

  return {
    hasApiKey: !!key,
    apiKeyLast4: last4,
    customModels: Array.isArray(doc.customModels) ? doc.customModels : [],
  };
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

  const raw = (await db
    .collection("user_settings")
    .findOne({ userId })) as UserSettingsDoc | null;

  return NextResponse.json(sanitize(raw));
}

export async function PUT(req: NextRequest) {
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

  const update: Partial<UserSettingsDoc> = {};

  if (Object.prototype.hasOwnProperty.call(body, "openRouterApiKey")) {
    const key = (body as Record<string, unknown>).openRouterApiKey;
    if (typeof key === "string" && key.trim()) {
      update.openRouterApiKey = key.trim();
    } else {
      update.openRouterApiKey = null;
    }
  }

  const maybeCustomModels = (body as Record<string, unknown>).customModels;
  if (Array.isArray(maybeCustomModels)) {
    const cleaned: ModelConfig[] = maybeCustomModels
      .map((m): ModelConfig | null => {
        if (!m || typeof m !== "object") return null;
        const obj = m as Record<string, unknown>;

        const id = typeof obj.id === "string" ? obj.id : "";
        if (!id) return null;

        const label =
          typeof obj.label === "string" && obj.label ? obj.label : id;
        const description =
          typeof obj.description === "string" ? obj.description : undefined;
        const contextWindow =
          typeof obj.contextWindow === "number" ? obj.contextWindow : undefined;
        const provider =
          typeof obj.provider === "string" && obj.provider
            ? obj.provider
            : undefined;
        const origin =
          obj.origin === "default" || obj.origin === "custom"
            ? obj.origin
            : "custom";

        return {
          id,
          label,
          description,
          contextWindow,
          provider,
          origin,
        };
      })
      .filter((m): m is ModelConfig => m !== null);

    update.customModels = cleaned;
  }

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  await db.collection("user_settings").updateOne(
    { userId },
    {
      $set: {
        userId,
        ...update,
      },
    },
    { upsert: true }
  );

  const saved = (await db
    .collection("user_settings")
    .findOne({ userId })) as UserSettingsDoc | null;

  return NextResponse.json(sanitize(saved));
}

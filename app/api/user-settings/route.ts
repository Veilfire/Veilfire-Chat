import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import clientPromise from "@/lib/mongodb";
import type { ModelConfig } from "@/lib/chatTypes";

const DB_NAME = process.env.MONGODB_DB || "llm_chat_mvp";

interface McpServerEnvVarDoc {
  key: string;
  value: string;
}

interface McpServerConfigDoc {
  id: string;
  label?: string;
  enabled?: boolean;
  type?: string;
  command?: string;
  args?: string[];
  env?: McpServerEnvVarDoc[];
}

interface UserSettingsDoc {
  userId: string;
  openRouterApiKey?: string | null;
  customModels?: ModelConfig[];
  mcpEnabled?: boolean;
  mcpServers?: McpServerConfigDoc[];
}

function sanitize(doc: UserSettingsDoc | null) {
  if (!doc) {
    return {
      hasApiKey: false,
      apiKeyLast4: null as string | null,
      customModels: [] as ModelConfig[],
      mcpEnabled: false,
      mcpServers: [] as McpServerConfigDoc[],
    };
  }

  const key = doc.openRouterApiKey ?? null;
  const last4 = key && key.length >= 4 ? key.slice(-4) : null;

  const normalizedServers = Array.isArray(doc.mcpServers)
    ? doc.mcpServers
        .map((server): McpServerConfigDoc | null => {
          if (!server || typeof server !== "object") return null;

          const id = typeof server.id === "string" && server.id ? server.id : "";
          if (!id) return null;

          const label =
            typeof server.label === "string" && server.label ? server.label : id;
          const enabled = !!server.enabled;
          const type =
            typeof server.type === "string" && server.type ? server.type : undefined;
          const command =
            typeof server.command === "string" ? server.command : "";

          const args = Array.isArray(server.args)
            ? server.args.filter((a): a is string => typeof a === "string")
            : [];

          const env = Array.isArray(server.env)
            ? server.env
                .map((pair): McpServerEnvVarDoc | null => {
                  if (!pair || typeof pair !== "object") return null;
                  const key =
                    typeof pair.key === "string" ? pair.key : "";
                  const value =
                    typeof pair.value === "string" ? pair.value : "";
                  if (!key && !value) return null;
                  return { key, value };
                })
                .filter((p): p is McpServerEnvVarDoc => p !== null)
            : [];

          return {
            id,
            label,
            enabled,
            type,
            command,
            args,
            env,
          };
        })
        .filter((s): s is McpServerConfigDoc => s !== null)
    : [];

  return {
    hasApiKey: !!key,
    apiKeyLast4: last4,
    customModels: Array.isArray(doc.customModels) ? doc.customModels : [],
    mcpEnabled: !!doc.mcpEnabled,
    mcpServers: normalizedServers,
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

  const maybeMcpEnabled = (body as Record<string, unknown>).mcpEnabled;
  if (typeof maybeMcpEnabled === "boolean") {
    update.mcpEnabled = maybeMcpEnabled;
  }

  const maybeMcpServers = (body as Record<string, unknown>).mcpServers;
  if (Array.isArray(maybeMcpServers)) {
    const cleanedMcp: McpServerConfigDoc[] = maybeMcpServers
      .map((server): McpServerConfigDoc | null => {
        if (!server || typeof server !== "object") return null;
        const obj = server as Record<string, unknown>;

        const id = typeof obj.id === "string" ? obj.id : "";
        if (!id) return null;

        const label =
          typeof obj.label === "string" && obj.label ? obj.label : id;
        const enabled = Boolean(obj.enabled);
        const type =
          typeof obj.type === "string" && obj.type ? obj.type : undefined;
        const command =
          typeof obj.command === "string" ? obj.command : "";

        const argsSource = obj.args;
        const args = Array.isArray(argsSource)
          ? argsSource.filter((a): a is string => typeof a === "string")
          : [];

        const envSource = obj.env;
        const env: McpServerEnvVarDoc[] = Array.isArray(envSource)
          ? envSource
              .map((pair): McpServerEnvVarDoc | null => {
                if (!pair || typeof pair !== "object") return null;
                const p = pair as Record<string, unknown>;
                const key =
                  typeof p.key === "string" ? p.key : "";
                const value =
                  typeof p.value === "string" ? p.value : "";
                if (!key && !value) return null;
                return { key, value };
              })
              .filter((p): p is McpServerEnvVarDoc => p !== null)
          : [];

        return {
          id,
          label,
          enabled,
          type,
          command,
          args,
          env,
        };
      })
      .filter((s): s is McpServerConfigDoc => s !== null);

    update.mcpServers = cleanedMcp;
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

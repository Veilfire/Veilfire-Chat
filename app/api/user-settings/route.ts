import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import clientPromise from "@/lib/mongodb";
import type { ModelConfig } from "@/lib/chatTypes";

const DB_NAME = process.env.MONGODB_DB || "veilfire_chat";

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

type HttpMethod =
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE";

interface WebClientSecretDoc {
  allowModelAccess?: boolean;
  value?: string | null;
}

interface WebClientDomainDoc {
  id: string;
  domain: string;
  enabled?: boolean;
  methods?: HttpMethod[];
  secret?: WebClientSecretDoc;
}

interface UserSettingsDoc {
  userId: string;
  openRouterApiKey?: string | null;
  customModels?: ModelConfig[];
  mcpEnabled?: boolean;
  mcpServers?: McpServerConfigDoc[];
   webClientEnabled?: boolean;
   webClientEnforceWhitelist?: boolean;
   webClientAllowLocalNetwork?: boolean;
   webClientDomains?: WebClientDomainDoc[];
}

const HTTP_METHODS: HttpMethod[] = [
  "GET",
  "HEAD",
  "OPTIONS",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
];

function isValidHttpMethod(value: unknown): value is HttpMethod {
  return typeof value === "string" && HTTP_METHODS.includes(value as HttpMethod);
}

function sanitize(doc: UserSettingsDoc | null) {
  if (!doc) {
    return {
      hasApiKey: false,
      apiKeyLast4: null as string | null,
      customModels: [] as ModelConfig[],
      mcpEnabled: false,
      mcpServers: [] as McpServerConfigDoc[],
      webClientEnabled: false,
      webClientEnforceWhitelist: true,
      webClientAllowLocalNetwork: false,
      webClientDomains: [] as {
        id: string;
        domain: string;
        enabled: boolean;
        methods: HttpMethod[];
        hasSecret: boolean;
        allowModelAccess: boolean;
      }[],
    };
  }

  const key = doc.openRouterApiKey ?? null;
  const last4 = key && key.length >= 4 ? key.slice(-4) : null;

  const normalizedServers = Array.isArray(doc.mcpServers)
    ? doc.mcpServers
        .map((server): McpServerConfigDoc | null => {
          if (!server || typeof server !== "object") return null;
          const obj = server as unknown as Record<string, unknown>;

          const id = typeof obj.id === "string" && obj.id ? (obj.id as string) : "";
          if (!id) return null;

          const label =
            typeof obj.label === "string" && obj.label ? (obj.label as string) : id;
          const enabled = Boolean(obj.enabled);
          const type =
            typeof obj.type === "string" && obj.type ? (obj.type as string) : undefined;
          const command =
            typeof obj.command === "string" ? (obj.command as string) : "";

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
                  const key = typeof p.key === "string" ? (p.key as string) : "";
                  const value =
                    typeof p.value === "string" ? (p.value as string) : "";
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

  const normalizedWebDomains = Array.isArray(doc.webClientDomains)
    ? doc.webClientDomains
        .map((domain):
          | {
              id: string;
              domain: string;
              enabled: boolean;
              methods: HttpMethod[];
              hasSecret: boolean;
              allowModelAccess: boolean;
            }
          | null => {
          if (!domain || typeof domain !== "object") return null;
          const d = domain as Partial<WebClientDomainDoc> & Record<string, unknown>;

          const id = typeof d.id === "string" && d.id ? d.id : "";
          if (!id) return null;

          let rawDomain =
            typeof d.domain === "string" && d.domain ? d.domain.trim() : "";
          if (!rawDomain) return null;
          rawDomain = rawDomain.toLowerCase();

          const enabled = !!d.enabled;

          const methodsSource = Array.isArray(d.methods) ? d.methods : undefined;
          const methods = methodsSource
            ? methodsSource.filter((m): m is HttpMethod => isValidHttpMethod(m))
            : (["GET"] as HttpMethod[]);

          const hasSecret = !!(d.secret && d.secret.value);
          const allowModelAccess = !!(d.secret && d.secret.allowModelAccess);

          return {
            id,
            domain: rawDomain,
            enabled,
            methods,
            hasSecret,
            allowModelAccess,
          };
        })
        .filter(
          (d): d is {
            id: string;
            domain: string;
            enabled: boolean;
            methods: HttpMethod[];
            hasSecret: boolean;
            allowModelAccess: boolean;
          } => d !== null
        )
    : [];

  return {
    hasApiKey: !!key,
    apiKeyLast4: last4,
    customModels: Array.isArray(doc.customModels) ? doc.customModels : [],
    mcpEnabled: !!doc.mcpEnabled,
    mcpServers: normalizedServers,
    webClientEnabled: !!doc.webClientEnabled,
    webClientEnforceWhitelist:
      typeof doc.webClientEnforceWhitelist === "boolean"
        ? doc.webClientEnforceWhitelist
        : true,
    webClientAllowLocalNetwork: !!doc.webClientAllowLocalNetwork,
    webClientDomains: normalizedWebDomains,
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

  const client = await clientPromise;
  const db = client.db(DB_NAME);

  const existing = (await db
    .collection("user_settings")
    .findOne({ userId })) as UserSettingsDoc | null;

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
    update.customModels = maybeCustomModels
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
  }

  const maybeMcpEnabled = (body as Record<string, unknown>).mcpEnabled;
  if (typeof maybeMcpEnabled === "boolean") {
    update.mcpEnabled = maybeMcpEnabled;
  }

  const maybeMcpServers = (body as Record<string, unknown>).mcpServers;
  if (Array.isArray(maybeMcpServers)) {
    update.mcpServers = maybeMcpServers
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
  }

  const maybeWebClientEnabled = (body as Record<string, unknown>)
    .webClientEnabled;
  if (typeof maybeWebClientEnabled === "boolean") {
    update.webClientEnabled = maybeWebClientEnabled;
  }

  const maybeWebClientEnforceWhitelist = (body as Record<string, unknown>)
    .webClientEnforceWhitelist;
  if (typeof maybeWebClientEnforceWhitelist === "boolean") {
    update.webClientEnforceWhitelist = maybeWebClientEnforceWhitelist;
  }

  const maybeWebClientAllowLocalNetwork = (body as Record<string, unknown>)
    .webClientAllowLocalNetwork;
  if (typeof maybeWebClientAllowLocalNetwork === "boolean") {
    update.webClientAllowLocalNetwork = maybeWebClientAllowLocalNetwork;
  }

  const maybeWebClientDomains = (body as Record<string, unknown>)
    .webClientDomains;
  if (Array.isArray(maybeWebClientDomains)) {
    const existingDomains = Array.isArray(existing?.webClientDomains)
      ? existing!.webClientDomains
      : [];

    const cleanedWebDomains: WebClientDomainDoc[] = maybeWebClientDomains
      .map((domain): WebClientDomainDoc | null => {
        if (!domain || typeof domain !== "object") return null;
        const obj = domain as Record<string, unknown>;

        const id = typeof obj.id === "string" ? obj.id : "";
        if (!id) return null;

        let rawDomain =
          typeof obj.domain === "string" ? obj.domain.trim().toLowerCase() : "";
        if (!rawDomain) return null;

        // Basic normalization: strip protocol and path if present.
        try {
          if (!rawDomain.includes("//")) {
            const url = new URL(`https://${rawDomain}`);
            rawDomain = url.hostname.toLowerCase();
          } else {
            const url = new URL(rawDomain);
            rawDomain = url.hostname.toLowerCase();
          }
        } catch {
          // If URL parsing fails, fall back to the raw hostname string.
        }

        const enabled = Boolean(obj.enabled);

        const methodsSource = obj.methods;
        const methods: HttpMethod[] = Array.isArray(methodsSource)
          ? methodsSource.filter((m): m is HttpMethod => isValidHttpMethod(m))
          : (["GET"] as HttpMethod[]);

        const previous = existingDomains.find((d) => d.id === id);
        const secretSource = obj.secret as
          | (Partial<WebClientSecretDoc> & Record<string, unknown>)
          | undefined;

        const allowModelAccess =
          typeof secretSource?.allowModelAccess === "boolean"
            ? secretSource.allowModelAccess
            : !!previous?.secret?.allowModelAccess;

        let value: string | null | undefined;
        if (typeof secretSource?.value === "string" && secretSource.value.trim()) {
          value = secretSource.value.trim();
        } else if (previous?.secret && typeof previous.secret.value === "string") {
          value = previous.secret.value;
        }

        const secret: WebClientSecretDoc | undefined =
          allowModelAccess || value
            ? {
                allowModelAccess,
                value: value ?? null,
              }
            : undefined;

        return {
          id,
          domain: rawDomain,
          enabled,
          methods,
          secret,
        };
      })
      .filter((d): d is WebClientDomainDoc => d !== null);

    update.webClientDomains = cleanedWebDomains;
  }

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

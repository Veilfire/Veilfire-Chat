"use server";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";

export interface McpServerDefinition {
  id: string;
  label: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpToolSummary {
  serverId: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpCallOptions {
  serverId: string;
  name: string;
  args?: unknown;
}

interface McpClientHandle {
  client: Client;
  transport: StdioClientTransport;
}

class McpClientManager {
  private readonly definitions: Map<string, McpServerDefinition>;
  private readonly clients = new Map<string, McpClientHandle>();

  constructor(definitions: McpServerDefinition[]) {
    this.definitions = new Map(definitions.map((d) => [d.id, d]));
  }

  private async getOrCreateClient(serverId: string): Promise<McpClientHandle> {
    const existing = this.clients.get(serverId);
    if (existing) {
      return existing;
    }

    const definition = this.definitions.get(serverId);
    if (!definition) {
      throw new Error(`Unknown MCP server id: ${serverId}`);
    }

    const transport = new StdioClientTransport({
      command: definition.command,
      args: definition.args,
      env: definition.env ? { ...process.env, ...definition.env } : process.env,
    });

    const client = new Client(
      { name: "veilfire-chat", version: "0.1.0" },
      { capabilities: {} }
    );

    await client.connect(transport);

    const handle: McpClientHandle = { client, transport };
    this.clients.set(serverId, handle);
    return handle;
  }

  async listTools(serverId: string): Promise<McpToolSummary[]> {
    const { client } = await this.getOrCreateClient(serverId);

    const response = await client.request(
      { method: "tools/list" },
      ListToolsResultSchema
    );

    return response.tools.map((tool) => ({
      serverId,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async listAllTools(): Promise<McpToolSummary[]> {
    const summaries: McpToolSummary[] = [];
    const serverIds = Array.from(this.definitions.keys());

    for (const serverId of serverIds) {
      try {
        const tools = await this.listTools(serverId);
        summaries.push(...tools);
      } catch {
        // Ignore individual server failures when aggregating tools.
      }
    }

    return summaries;
  }

  async callTool(options: McpCallOptions): Promise<unknown> {
    const { client } = await this.getOrCreateClient(options.serverId);

    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: options.name,
          args: options.args ?? {},
        },
      },
      CallToolResultSchema
    );

    return result;
  }

  async close(serverId?: string): Promise<void> {
    const ids = serverId ? [serverId] : Array.from(this.clients.keys());

    await Promise.all(
      ids.map(async (id) => {
        const handle = this.clients.get(id);
        if (!handle) {
          return;
        }

        try {
          await handle.client.close();
        } finally {
          if (typeof (handle.transport as unknown as { close?: () => unknown }).close === "function") {
            try {
              await (handle.transport as unknown as { close: () => unknown }).close();
            } catch {
              // Swallow transport close errors.
            }
          }
        }

        this.clients.delete(id);
      })
    );
  }
}

const DEFAULT_MCP_SERVERS: McpServerDefinition[] = [];

export const mcpClientManager = new McpClientManager(DEFAULT_MCP_SERVERS);

export { McpClientManager };

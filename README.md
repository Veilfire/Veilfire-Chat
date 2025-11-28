# Veilfire Chat

Agentic multi-conversation AI chat app with tools, per-conversation scratchpad, and rich logging.

- Next.js 14 (App Router)
- React + Tailwind CSS
- NextAuth (credentials) + MongoDB adapter
- MongoDB for conversation, scratchpad, and log storage
- OpenRouter (OpenAI-compatible) for model access
- `tiktoken` for accurate server-side token counting
- MCP client foundation using the Model Context Protocol (MCP) SDK for connecting to external tools via stdio

## Features

- **Multiple conversations** with per-thread settings (model, prompts, context strategy).
- **Agentic tools** exposed to the model via OpenAI-compatible tools API:
  - `get_scratchpad` / `set_scratchpad` for per-conversation working memory.
  - `get_utc_time` backed by https://www.timeapi.io for precise UTC time.
- **Scratchpad UX**:
  - Floating, draggable scratchpad widget that appears when the model uses the scratchpad.
  - Per-response scratchpad icon and modal to inspect the latest scratchpad content.
- **Prompt chain**:
  - Immutable base system prompt that defines Veilfire Chat behavior.
  - User-editable System / Planner / Reflector prompts per conversation.
- **Provider manager** for OpenRouter models, stored per-user in MongoDB.
- **Logs viewer** with full request/response inspection.
- **Privacy by design**:
  - No cookies or other tracking.
  - No data collection.
  - All logging is local in MongoDB.
  - The user must configure OpenRouter provider settings to enhance privacy. See https://openrouter.ai/settings/privacy for details.

## Local development (without Docker)

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` and fill in values:

```bash
cp .env.example .env.local
```

You must provide at least:

- `OPENROUTER_API_KEY` – from https://openrouter.ai
- `NEXTAUTH_SECRET` – long random string
- `MONGODB_URI` – e.g. `mongodb://localhost:27017/veilfire_chat`

3. Run MongoDB locally (or point `MONGODB_URI` at an existing instance).

4. Run dev server:

```bash
npm run dev
```

5. Open http://localhost:3000

## Auth

- Register at `/auth/register`.
- Then log in at `/auth/login`.
- Sessions are handled by NextAuth with JWT strategy.
- Users are stored in MongoDB via `@next-auth/mongodb-adapter`.
- Passwords are hashed with `bcryptjs` and stored on the user document.

## Conversations & storage

- Conversations are stored in the `conversations` collection.
- Each document contains:
  - `userId`
  - `id` (external UUID)
  - `title`
  - `createdAt` / `updatedAt`
  - `messages` (embedded user/assistant/system messages)
  - `settings` (model, prompts, context config, etc.)

## Context / memory management

- Context strategy is configured per conversation:
  - **Full** – send all messages.
  - **Last N messages**.
  - **Approx token limit** – server uses `tiktoken` to count tokens with a GPT-4-style encoding (`encoding_for_model` or `o200k_base` fallback).
- The `/api/chat` route trims messages on the server before calling OpenRouter.

## Prompt presets

- You can save / load presets (System / Planner / Reflector) per browser.
- Presets are stored in `localStorage` under `llm-chat-prompt-presets`.

## Configuration: prompts, models, MCP

- Click the small **gear icon (⚙)** in the top-right of the chat view to open a full-screen configuration modal.
- The modal is organized into three tabs:

  - **Prompts**
    - Edit the System prompt, Planner instructions, and Reflector / self-critique prompt for the *active conversation*.
    - Save the current prompt set as a preset and re-apply presets across conversations.

  - **Models & provider**
    - Store an OpenRouter API key per user in the `user_settings` collection (the environment `OPENROUTER_API_KEY` is used as a fallback).
    - Browse and search models from OpenRouter (via `/api/openrouter-models`) and add them to your personal model list.
    - See provider and context window information for each model.
    - Remove custom models from your list.
    - The combined list of default and custom models is available in the left sidebar **Model** selector for each conversation.

  - **MCP** (Model Context Protocol)
    - Enable or disable MCP usage for the current user.
    - Configure one or more MCP servers that Veilfire Chat can connect to via stdio.
    - Each server definition includes:
      - A stable `id` used internally.
      - A human-friendly label.
      - A `command` and `args[]` to start the MCP server process.
      - Optional environment/parameter key–value pairs (merged into the child process environment).
    - MCP server definitions are stored per user in the `user_settings` collection alongside provider settings.
    - **Note:** the app does not ship any MCP servers. You must install and configure your own MCP-compatible servers on the host where Veilfire runs.

## MCP quick start

Veilfire Chat includes an MCP client manager (see `lib/mcpClient.ts`) that can connect to one or more MCP servers over stdio using the official `@modelcontextprotocol/sdk`.

At the moment, MCP integration focuses on **configuration and connection management**:

- Per-user MCP server definitions are stored in MongoDB (`user_settings` collection) via `/api/user-settings`.
- The MCP tab in the config modal lets you manage these definitions without editing JSON by hand.
- Future work will expose MCP tools directly to the model via the OpenAI tools API in `/api/chat`.

### 1. Prerequisites

- One or more MCP-compatible servers installed on the same host where Veilfire runs.
- Each server must support **stdio transport** (read/write on stdin/stdout).
- You should be able to start your server from the command line, e.g.:

  ```bash
  node path/to/your-mcp-server.js
  # or
  ./your-mcp-server-binary --flag value
  ```

### 2. Add an MCP server in the UI

1. Log in to Veilfire Chat.
2. Click the **⚙ Configuration** button in the top-right.
3. Open the **MCP** tab.
4. Turn on the **Enabled** toggle.
5. Click **+ Add MCP server** and fill in:
   - **Server id** – a stable identifier, e.g. `filesystem-mcp`.
   - **Server name** – any human-friendly label.
   - **Command** – the binary or interpreter, e.g. `node` or `/usr/local/bin/your-mcp-server`.
   - **Arguments** – space-separated args, e.g. `path/to/server.js --flag value`.
   - **Environment / parameters** – optional key–value pairs required by the server (API keys, config flags, etc.).
6. Click **Save MCP settings**.

This creates (or updates) a per-user entry in `user_settings` that looks conceptually like:

```json
{
  "mcpEnabled": true,
  "mcpServers": [
    {
      "id": "filesystem-mcp",
      "label": "Filesystem MCP server",
      "enabled": true,
      "type": "custom",
      "command": "node",
      "args": ["/path/to/your-mcp-server.js", "--flag", "value"],
      "env": {
        "SOME_SERVER_SPECIFIC_KEY": "value"
      }
    }
  ]
}
```

> The UI represents `env` as a list of key–value rows; the backend normalizes this to a simple object.

### 3. How the MCP client uses this config

- The server-side MCP client manager (`mcpClientManager` in `lib/mcpClient.ts`) uses the per-user `mcpServers` definitions to spawn stdio transports via `StdioClientTransport`.
- When connecting to a server, Veilfire merges a filtered copy of `process.env` with the configured MCP server env/parameters and passes that as the child process environment.
- Each server is keyed by its `id`; the MCP client reuses connections on subsequent calls instead of spawning new processes repeatedly.

Future work will wire these MCP servers into `/api/chat` so that declared MCP tools appear as OpenAI-compatible tools for the model.

## File uploads

- Upload button next to the send button.
- `txt` / `csv` contents are inlined into a system message (preview truncated).
- PDFs / Excel / images are attached as metadata only in this MVP.

## Logging

- Every completion request to `/api/chat` is logged to the `chat_logs` collection in MongoDB.
- Each log document contains:
  - `userId`, `conversationId`, `createdAt`, `modelId`.
  - `request`:
    - Full prompt chain: system / planner / reflector prompts.
    - Context configuration.
    - Full message list (pre-trim) and trimmed message list actually sent.
    - Scratchpad content used for the run (if any).
  - `response`:
    - Final assistant content (fully streamed text).

### Log viewer UI

- Click **“View logs”** in the left sidebar to open the logs side panel.
- Logs are scoped to the currently selected conversation.
- In the panel you can:
  - See a list of log entries (timestamp, model, user message preview).
  - Select a log to inspect:
    - Overview (model, timestamp).
    - Prompts (system / planner / reflector).
    - Context configuration.
    - Request messages (role + timestamp + content).
    - Response content.

## Running with Docker

This repo includes a multi-stage `Dockerfile` and a `docker-compose.yml` for running Veilfire Chat with MongoDB.

### 1. Prepare environment

Create a `.env` file in the project root (you can start from `.env.example`) and set at least:

- `OPENROUTER_API_KEY`
- `NEXTAUTH_SECRET`

You do **not** need to set `MONGODB_URI` for Docker Compose; it is overridden to point at the `mongo` service.

### 2. Build the Docker image

```bash
docker compose build
```

This uses the provided `Dockerfile` to build a production Next.js image.

### 3. Run app + MongoDB via Docker Compose

```bash
docker compose up
```

This will start:

- **app** – Veilfire Chat on http://localhost:3000
- **mongo** – MongoDB 7.x with a named volume `mongo-data` for persistence

To run in detached mode:

```bash
docker compose up -d
```

To stop the stack:

```bash
docker compose down
```

## Coming soon

- More tools!
- MCP tools exposed directly to the model via the OpenAI tools API
- Embedding model support which will feed into...
- VectorDB integration for RAG capabilities

## License & Contributing

- Source code is licensed under the Apache License 2.0. See `LICENSE.md` for full terms.
- By submitting a pull request, you agree that your contributions are licensed
  under the same Apache-2.0 license as this project. See `CONTRIBUTING.md` for details.
- Use of the Veilfire name and logo is governed by the trademark guidelines in
  `TRADEMARKS.md`. 

Made in Canada 🇨🇦

https://veilfire.io

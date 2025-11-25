# Veilfire Chat

Agentic multi-conversation AI chat app with tools, per-conversation scratchpad, and rich logging.

- Next.js 14 (App Router)
- React + Tailwind CSS
- NextAuth (credentials) + MongoDB adapter
- MongoDB for conversation, scratchpad, and log storage
- OpenRouter (OpenAI-compatible) for model access
- `tiktoken` for accurate server-side token counting

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

## Configuration & provider manager

- Click the small **gear icon (⚙)** in the top-right of the chat view to open a full-screen configuration modal.
- The **Prompts** section lets you:
  - Edit the System prompt, Planner instructions, and Reflector / self-critique prompt.
  - Save the current prompt set as a preset and re-apply presets across conversations.
- The **Provider manager** section lets you:
  - Store an OpenRouter API key per user in the `user_settings` collection (the environment `OPENROUTER_API_KEY` is used as a fallback).
  - Browse and search models from OpenRouter (via `/api/openrouter-models`) and add them to your personal model list.
  - See provider and context window information for each model.
  - Remove custom models from your list.
- The combined list of default and custom models is available in the left sidebar **Model** selector for each conversation.

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
- MCP Client
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

"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DEFAULT_MODELS } from "@/lib/models";
import type {
  ChatMessage,
  Conversation,
  UploadedFile,
  ModelConfig,
  ContextStrategy,
} from "@/lib/chatTypes";
import type { ChatLog } from "@/lib/logTypes";
import { v4 as uuid } from "uuid";

interface PromptPreset {
  id: string;
  name: string;
  systemPrompt: string;
  plannerPrompt: string;
  reflectorPrompt: string;
}

interface UserSettingsState {
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  customModels: ModelConfig[];
}

const PRESETS_STORAGE_KEY = "llm-chat-prompt-presets";

function loadPresets(): PromptPreset[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(PRESETS_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PromptPreset[];
  } catch {
    return [];
  }
}

function savePresets(presets: PromptPreset[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

function formatDefaultConversationTitle(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const yyyy = date.getFullYear();
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `Chat ${mm}-${dd}-${yyyy} ${hh}:${min}`;
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [thinkingElapsedMs, setThinkingElapsedMs] = useState(0);
  const [sendOnEnter, setSendOnEnter] = useState(false);

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [presetNameInput, setPresetNameInput] = useState("");

  const [showLogsPanel, setShowLogsPanel] = useState(false);
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const [logsPanelWidth, setLogsPanelWidth] = useState<number>(380);

  const logsListRef = useRef<HTMLDivElement | null>(null);
  const logsDetailRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const titleInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [pendingTitleFocusId, setPendingTitleFocusId] = useState<string | null>(
    null
  );
  const summarizedTitlesRef = useRef<Set<string>>(new Set());
  const [logsListCanScrollUp, setLogsListCanScrollUp] = useState(false);
  const [logsListCanScrollDown, setLogsListCanScrollDown] = useState(false);
  const [logsDetailCanScrollUp, setLogsDetailCanScrollUp] = useState(false);
  const [logsDetailCanScrollDown, setLogsDetailCanScrollDown] = useState(false);

  const [showConfigModal, setShowConfigModal] = useState(false);

  const [scratchpad, setScratchpad] = useState<string>("");
  const [scratchpadVisible, setScratchpadVisible] = useState(false);

  const [scratchpadWidgetPos, setScratchpadWidgetPos] = useState<
    { x: number; y: number } | null
  >(null);

  const [scratchpadWidgetPulse, setScratchpadWidgetPulse] = useState(false);

  const [scratchpadWidgetEnabled, setScratchpadWidgetEnabled] = useState(false);

  const [toolsUsedThisRun, setToolsUsedThisRun] = useState<string[]>([]);
  const [currentAssistantMessageId, setCurrentAssistantMessageId] = useState<
    string | null
  >(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const [userSettings, setUserSettings] = useState<UserSettingsState | null>(
    null
  );
  const [userSettingsLoading, setUserSettingsLoading] = useState(false);
  const [userSettingsError, setUserSettingsError] = useState<string | null>(
    null
  );

  const [openRouterModels, setOpenRouterModels] = useState<ModelConfig[]>([]);
  const [openRouterModelsLoading, setOpenRouterModelsLoading] =
    useState(false);
  const [openRouterModelsError, setOpenRouterModelsError] = useState<
    string | null
  >(null);

  const [modelSearch, setModelSearch] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeySaving, setApiKeySaving] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPresets(loadPresets());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("vf-scratchpad-widget-pos");
      if (raw) {
        const parsed = JSON.parse(raw) as { x: number; y: number };
        if (
          parsed &&
          typeof parsed.x === "number" &&
          typeof parsed.y === "number"
        ) {
          setScratchpadWidgetPos(parsed);
          return;
        }
      }
    } catch {
    }
    const width = window.innerWidth || 0;
    const height = window.innerHeight || 0;
    const iconSize = 40;
    const margin = 24;
    const inputRegionHeight = 220; // approximate chat input bar height
    const defaultX =
      width > 0 ? width - iconSize - margin : 0;
    const defaultY =
      height > 0
        ? Math.max(margin, height - inputRegionHeight - iconSize - margin)
        : 0;
    setScratchpadWidgetPos({ x: defaultX, y: defaultY });
  }, []);

  useEffect(() => {
    if (!scratchpadWidgetPulse) return;
    if (typeof window === "undefined") return;
    const id = window.setTimeout(() => {
      setScratchpadWidgetPulse(false);
    }, 1200);
    return () => {
      window.clearTimeout(id);
    };
  }, [scratchpadWidgetPulse]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (!isSending) {
      setThinkingElapsedMs(0);
      return;
    }

    const start = Date.now();
    const id = window.setInterval(() => {
      setThinkingElapsedMs(Date.now() - start);
    }, 75);

    return () => {
      window.clearInterval(id);
    };
  }, [isSending]);

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    const load = async () => {
      setLoadingConversations(true);
      try {
        const res = await fetch("/api/conversations");
        if (!res.ok) {
          if (res.status === 401) {
            router.replace("/auth/login");
          }
          return;
        }
        const data = (await res.json()) as Conversation[];
        if (cancelled) return;
        if (data.length > 0) {
          setConversations(data);
          setActiveId(data[0].id);
        } else {
          const resNew = await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });

          const toolsHeader =
            resNew.headers.get("x-tools-used") || resNew.headers.get("X-Tools-Used");
          if (toolsHeader) {
            const runTools = toolsHeader
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
            setToolsUsedThisRun(runTools);
          }
          if (resNew.ok) {
            const conv = (await resNew.json()) as Conversation;
            if (!cancelled) {
              setConversations([conv]);
              setActiveId(conv.id);
              setPendingTitleFocusId(conv.id);
            }
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) {
          setLoadingConversations(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [status, router]);

  const activeConversation =
    conversations.find((c) => c.id === activeId) ?? null;

  const lastMessage =
    activeConversation && activeConversation.messages.length > 0
      ? activeConversation.messages[activeConversation.messages.length - 1]
      : null;

  const lastMessageSignature = lastMessage
    ? `${lastMessage.id}:${lastMessage.content.length}`
    : "";

  useEffect(() => {
    if (!activeConversation) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activeConversation, lastMessageSignature]);

  useEffect(() => {
    if (!pendingTitleFocusId) return;
    const el = titleInputRefs.current[pendingTitleFocusId];
    if (!el) return;
    el.focus();
    el.select();
    setPendingTitleFocusId(null);
  }, [pendingTitleFocusId, conversations.length]);

  useEffect(() => {
    if (!activeConversation) return;
    if (summarizedTitlesRef.current.has(activeConversation.id)) return;

    const defaultTitle = formatDefaultConversationTitle(
      new Date(activeConversation.createdAt)
    );

    if (activeConversation.title !== defaultTitle) return;

    const userMessages = activeConversation.messages.filter(
      (m) => m.role === "user"
    );
    const assistantMessages = activeConversation.messages.filter(
      (m) => m.role === "assistant"
    );

    if (userMessages.length === 0 || assistantMessages.length === 0) {
      return;
    }

    summarizedTitlesRef.current.add(activeConversation.id);
    const convId = activeConversation.id;

    void (async () => {
      try {
        const lastMessages = activeConversation.messages.slice(-8);
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(convId)}/title`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              modelId: activeConversation.settings.modelId,
              messages: lastMessages,
            }),
          }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { title?: string | null };
        const newTitle = data.title?.trim();
        if (!newTitle) return;

        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  title: newTitle,
                  updatedAt: Date.now(),
                }
              : c
          )
        );
      } catch (err) {
        console.error("Failed to auto-summarize conversation title", err);
      }
    })();
  }, [activeConversation, setConversations]);

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    const loadSettings = async () => {
      setUserSettingsLoading(true);
      setUserSettingsError(null);
      try {
        const res = await fetch("/api/user-settings");
        if (!res.ok) {
          throw new Error(`Failed to load settings: ${res.status}`);
        }
        const data = (await res.json()) as UserSettingsState;
        if (!cancelled) {
          setUserSettings(data);
        }
      } catch {
        if (!cancelled) {
          setUserSettingsError(
            "Failed to load user settings. API key and custom models may be unavailable."
          );
        }
      } finally {
        if (!cancelled) {
          setUserSettingsLoading(false);
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (!showConfigModal) return;

    let cancelled = false;

    const loadModels = async () => {
      setOpenRouterModelsLoading(true);
      setOpenRouterModelsError(null);
      try {
        const res = await fetch("/api/openrouter-models");
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Failed to load models: ${res.status}`);
        }
        const data = (await res.json()) as { models?: ModelConfig[] };
        if (!cancelled) {
          setOpenRouterModels(data.models ?? []);
        }
      } catch {
        if (!cancelled) {
          setOpenRouterModelsError(
            "Failed to load models from OpenRouter. Check your API key."
          );
        }
      } finally {
        if (!cancelled) {
          setOpenRouterModelsLoading(false);
        }
      }
    };

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, [showConfigModal]);

  const allModels = useMemo(() => {
    const base = DEFAULT_MODELS.map((m) => ({
      ...m,
      origin: m.origin ?? "default",
    }));
    const custom = userSettings?.customModels ?? [];
    const seen = new Set<string>();
    const result: ModelConfig[] = [];
    for (const m of [...base, ...custom]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      result.push(m);
    }
    return result;
  }, [userSettings]);

  const selectedModel =
    activeConversation &&
    allModels.find((m) => m.id === activeConversation.settings.modelId);

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim() && !(userSettings?.hasApiKey ?? false)) {
      return;
    }
    setApiKeySaving(true);
    setUserSettingsError(null);
    try {
      const res = await fetch("/api/user-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openRouterApiKey: apiKeyInput.trim() || null,
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to save API key: ${res.status}`);
      }
      const data = (await res.json()) as UserSettingsState;
      setUserSettings(data);
      setApiKeyInput("");
    } catch {
      setUserSettingsError("Failed to save API key.");
    } finally {
      setApiKeySaving(false);
    }
  };

  const handleClearApiKey = async () => {
    setApiKeyInput("");
    setApiKeySaving(true);
    setUserSettingsError(null);
    try {
      const res = await fetch("/api/user-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openRouterApiKey: null }),
      });
      if (!res.ok) {
        throw new Error(`Failed to remove API key: ${res.status}`);
      }
      const data = (await res.json()) as UserSettingsState;
      setUserSettings(data);
    } catch {
      setUserSettingsError("Failed to remove API key.");
    } finally {
      setApiKeySaving(false);
    }
  };

  const handleAddCustomModel = async (model: ModelConfig) => {
    const current = userSettings?.customModels ?? [];
    if (current.some((m) => m.id === model.id)) {
      return;
    }
    setUserSettingsError(null);
    try {
      const res = await fetch("/api/user-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customModels: [
            ...current,
            {
              ...model,
              origin: "custom" as const,
            },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to save model: ${res.status}`);
      }
      const data = (await res.json()) as UserSettingsState;
      setUserSettings(data);
    } catch {
      setUserSettingsError("Failed to add model to your list.");
    }
  };

  const handleRemoveCustomModel = async (modelId: string) => {
    const current = userSettings?.customModels ?? [];
    const next = current.filter((m) => m.id !== modelId);
    setUserSettingsError(null);
    try {
      const res = await fetch("/api/user-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customModels: next }),
      });
      if (!res.ok) {
        throw new Error(`Failed to remove model: ${res.status}`);
      }
      const data = (await res.json()) as UserSettingsState;
      setUserSettings(data);
    } catch {
      setUserSettingsError("Failed to remove model from your list.");
    }
  };

  const persistConversation = useCallback(async (conv: Conversation) => {
    try {
      await fetch(`/api/conversations/${conv.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conv),
      });
    } catch {
      console.error("Failed to persist conversation");
    }
  }, []);

  const handleNewConversation = async () => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        console.error("Failed to create conversation");
        return;
      }
      const conv = (await res.json()) as Conversation;
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
      setInput("");
      setUploadedFiles([]);
      setLogs([]);
      setSelectedLogId(null);
      setPendingTitleFocusId(conv.id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      setActiveId(remaining[0]?.id ?? null);
      setLogs([]);
      setSelectedLogId(null);
    }
    try {
      await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error(err);
    }
  };

  const updateActiveConversation = (
    updater: (c: Conversation) => Conversation
  ) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === activeId);
      if (idx === -1) return prev;
      const updated = updater(prev[idx]);
      void persistConversation(updated);
      const copy = [...prev];
      copy[idx] = updated;
      return copy;
    });
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files) return;

    const newUploads: UploadedFile[] = [];

    for (const file of Array.from(files)) {
      const base: UploadedFile = {
        id: uuid(),
        name: file.name,
        type: file.type,
        size: file.size,
      };

      if (
        file.type === "text/plain" ||
        file.type === "text/csv" ||
        file.name.endsWith(".csv") ||
        file.name.endsWith(".txt")
      ) {
        const text = await file.text();
        base.textPreview = text.slice(0, 20_000);
      }

      newUploads.push(base);
    }

    setUploadedFiles((prev) => [...prev, ...newUploads]);
    e.target.value = "";
  };

  const loadLogsForConversation = useCallback(
    async (conversationId: string) => {
      setLogsLoading(true);
      setLogsError(null);
      try {
        const res = await fetch(
          `/api/logs?conversationId=${encodeURIComponent(conversationId)}`
        );
        if (!res.ok) {
          throw new Error(`Failed to load logs: ${res.status}`);
        }
        const data = (await res.json()) as ChatLog[];
        setLogs(data);
        setSelectedLogId(data[0]?.id ?? null);
      } catch (err) {
        console.error(err);
        setLogsError("Failed to load logs for this conversation.");
      } finally {
        setLogsLoading(false);
      }
    },
    []
  );

  const loadScratchpadForConversation = useCallback(
    async (conversationId: string) => {
      try {
        const res = await fetch(
          `/api/scratchpad?conversationId=${encodeURIComponent(conversationId)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { content?: string | null };
        const content = (data.content ?? "") || "";
        setScratchpad(content);
        setScratchpadWidgetEnabled((prev) => {
          const next = prev || Boolean(content);
          if (!prev && next) {
            setScratchpadWidgetPulse(true);
          }
          return next;
        });
        if (!content) {
          setScratchpadVisible(false);
        }
      } catch {
      }
    },
    []
  );

  useEffect(() => {
    if (showLogsPanel && activeConversation) {
      void loadLogsForConversation(activeConversation.id);
    }
  }, [showLogsPanel, activeConversation, loadLogsForConversation]);

  useEffect(() => {
    if (!activeConversation) {
      setScratchpad("");
      setScratchpadVisible(false);
      setScratchpadWidgetEnabled(false);
      return;
    }
    void loadScratchpadForConversation(activeConversation.id);
  }, [activeConversation, loadScratchpadForConversation]);

  const updateScrollFlags = useCallback(() => {
    const update = (
      el: HTMLDivElement | null,
      setUp: (value: boolean) => void,
      setDown: (value: boolean) => void
    ) => {
      if (!el) {
        setUp(false);
        setDown(false);
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = el;
      const canUp = scrollTop > 0;
      const canDown = scrollTop + clientHeight < scrollHeight - 1;
      setUp(canUp);
      setDown(canDown);
    };

    update(logsListRef.current, setLogsListCanScrollUp, setLogsListCanScrollDown);
    update(
      logsDetailRef.current,
      setLogsDetailCanScrollUp,
      setLogsDetailCanScrollDown
    );
  }, []);

  useEffect(() => {
    if (!showLogsPanel) return;
    if (typeof window === "undefined") return;

    const id = window.requestAnimationFrame(() => {
      updateScrollFlags();
    });

    return () => {
      window.cancelAnimationFrame(id);
    };
  }, [showLogsPanel, logs, selectedLogId, updateScrollFlags]);

  const handleLogsPanelResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (typeof window === "undefined") return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = logsPanelWidth;
    const viewportWidth = window.innerWidth || 0;
    const maxWidth = viewportWidth * 0.4;
    const minWidth = Math.min(260, maxWidth);

    const onMove = (event: MouseEvent) => {
      const deltaX = startX - event.clientX;
      let nextWidth = startWidth + deltaX;
      if (nextWidth < minWidth) nextWidth = minWidth;
      if (nextWidth > maxWidth) nextWidth = maxWidth;
      setLogsPanelWidth(nextWidth);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleScratchpadWidgetDragStart = (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (typeof window === "undefined") return;
    if (!scratchpadWidgetPos) {
      const width = window.innerWidth || 0;
      const height = window.innerHeight || 0;
      const iconSize = 40;
      const margin = 24;
      const inputRegionHeight = 220;
      const defaultX =
        width > 0 ? width - iconSize - margin : 0;
      const defaultY =
        height > 0
          ? Math.max(margin, height - inputRegionHeight - iconSize - margin)
          : 0;
      setScratchpadWidgetPos({ x: defaultX, y: defaultY });
    }
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const base =
      scratchpadWidgetPos ?? {
        x: (window.innerWidth || 0) - 120,
        y: (window.innerHeight || 0) - 140,
      };
    let lastX = base.x;
    let lastY = base.y;
    const onMove = (event: MouseEvent) => {
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const width = window.innerWidth || 0;
      const height = window.innerHeight || 0;
      const margin = 24;
      const iconSize = 40;
      let nextX = base.x + dx;
      let nextY = base.y + dy;
      if (nextX < margin) nextX = margin;
      if (nextY < margin) nextY = margin;
      if (nextX > width - iconSize - margin) {
        nextX = width - iconSize - margin;
      }
      if (nextY > height - iconSize - margin) {
        nextY = height - iconSize - margin;
      }
      lastX = nextX;
      lastY = nextY;
      setScratchpadWidgetPos({ x: nextX, y: nextY });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      try {
        window.localStorage.setItem(
          "vf-scratchpad-widget-pos",
          JSON.stringify({ x: lastX, y: lastY })
        );
      } catch {
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const sendMessage = useCallback(async () => {
    if (!activeConversation || !input.trim() || isSending) return;

    setToolsUsedThisRun([]);

    const userMessage: ChatMessage = {
      id: uuid(),
      role: "user",
      content: input,
      createdAt: Date.now(),
    };

    const messages: ChatMessage[] = [...activeConversation.messages];

    let uploadMessage: ChatMessage | null = null;
    if (uploadedFiles.length > 0) {
      const summaryLines = uploadedFiles.map((f) => {
        const base = `File: ${f.name} (${f.type || "unknown"}, ${Math.round(
          f.size / 1024
        )} KB)`;
        if (f.textPreview) {
          return `${base}\nPreview:\n${f.textPreview}`;
        }
        return `${base}\n(Content not extracted in this MVP.)`;
      });
      uploadMessage = {
        id: uuid(),
        role: "system",
        content:
          "The user has uploaded the following files. Use these as context where possible:\n\n" +
          summaryLines.join("\n\n---\n\n"),
        createdAt: Date.now(),
      };
      messages.push(uploadMessage);
    }

    messages.push(userMessage);

    const convWithUser: Conversation = {
      ...activeConversation,
      messages,
      updatedAt: Date.now(),
    };

    setConversations((prev) =>
      prev.map((c) => (c.id === convWithUser.id ? convWithUser : c))
    );
    setInput("");
    setUploadedFiles([]);
    setIsSending(true);

    const assistantMessage: ChatMessage = {
      id: uuid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };

    setCurrentAssistantMessageId(assistantMessage.id);

    const convWithAssistantPlaceholder: Conversation = {
      ...convWithUser,
      messages: [...convWithUser.messages, assistantMessage],
      updatedAt: Date.now(),
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === convWithAssistantPlaceholder.id ? convWithAssistantPlaceholder : c
      )
    );

    let accumulated = "";

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          conversationId: convWithUser.id,
          messages: convWithUser.messages,
          modelId: convWithUser.settings.modelId,
          systemPrompt: convWithUser.settings.systemPrompt,
          reflectorPrompt: convWithUser.settings.reflectorPrompt,
          plannerPrompt: convWithUser.settings.plannerPrompt,
          contextConfig: convWithUser.settings.context,
          temperature: convWithUser.settings.temperature,
        }),
        signal: controller.signal,
      });

      const toolsHeader =
        res.headers.get("x-tools-used") || res.headers.get("X-Tools-Used");
      if (toolsHeader) {
        const runTools = toolsHeader
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        setToolsUsedThisRun(runTools);
        if (runTools.includes("scratchpad")) {
          setScratchpadWidgetEnabled(true);
          setScratchpadWidgetPulse(true);
        }
      }

      if (!res.body) {
        throw new Error("No response body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        accumulated += chunk;

        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convWithAssistantPlaceholder.id) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === assistantMessage.id
                  ? { ...m, content: accumulated }
                  : m
              ),
              updatedAt: Date.now(),
            };
          })
        );
      }

      let finalConv: Conversation | null = null;

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convWithAssistantPlaceholder.id) return c;
          finalConv = {
            ...c,
            updatedAt: Date.now(),
          };
          return finalConv;
        })
      );

      if (finalConv) {
        const convToPersist: Conversation = finalConv;
        void persistConversation(convToPersist);

        if (showLogsPanel) {
          void loadLogsForConversation(convToPersist.id);
        }
        void loadScratchpadForConversation(convToPersist.id);
      }
    } catch (err) {
      if ((err as any)?.name === "AbortError") {
        let abortedConv: Conversation | null = null;

        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convWithAssistantPlaceholder.id) return c;
            abortedConv = {
              ...c,
              updatedAt: Date.now(),
            };
            return abortedConv;
          })
        );

        if (abortedConv) {
          const convToPersist: Conversation = abortedConv;
          void persistConversation(convToPersist);
          if (showLogsPanel) {
            void loadLogsForConversation(convToPersist.id);
          }
        }

        return;
      }

      console.error(err);
      const errorText =
        accumulated ||
        "Error streaming response. Check server logs or API key.";

      const errorConv: Conversation = {
        ...convWithUser,
        messages: [
          ...convWithUser.messages,
          { ...assistantMessage, content: errorText },
        ],
        updatedAt: Date.now(),
      };

      setConversations((prev) =>
        prev.map((c) => (c.id === errorConv.id ? errorConv : c))
      );

      void persistConversation(errorConv);
    } finally {
      abortControllerRef.current = null;
      setIsSending(false);
    }
  }, [
    activeConversation,
    input,
    isSending,
    uploadedFiles,
    persistConversation,
    showLogsPanel,
    loadLogsForConversation,
    loadScratchpadForConversation,
  ]);

  const handleCancelRequest = useCallback(() => {
    const controller = abortControllerRef.current;
    if (!controller) return;
    controller.abort();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      const isMeta = e.metaKey || e.ctrlKey;
      if (!sendOnEnter && isMeta) {
        e.preventDefault();
        void sendMessage();
        return;
      }
      if (!sendOnEnter) {
        return;
      }
      if (!e.shiftKey) {
        e.preventDefault();
        void sendMessage();
      }
    }
  };

  const handleSavePreset = () => {
    if (!activeConversation) return;
    const raw = presetNameInput.trim();
    if (!raw) return;

    const sanitized = raw.replace(/[^A-Za-z0-9 _-]/g, "").slice(0, 32);
    if (!sanitized) return;

    const preset: PromptPreset = {
      id: uuid(),
      name: sanitized,
      systemPrompt: activeConversation.settings.systemPrompt,
      plannerPrompt: activeConversation.settings.plannerPrompt,
      reflectorPrompt: activeConversation.settings.reflectorPrompt,
    };

    setPresets((prev) => {
      const updated = [...prev, preset];
      savePresets(updated);
      return updated;
    });
    setSelectedPresetId(preset.id);
    setPresetNameInput("");
  };

  const handleApplyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = presets.find((p) => p.id === presetId);
    if (!preset || !activeConversation) return;

    updateActiveConversation((conv) => ({
      ...conv,
      settings: {
        ...conv.settings,
        systemPrompt: preset.systemPrompt,
        plannerPrompt: preset.plannerPrompt,
        reflectorPrompt: preset.reflectorPrompt,
      },
    }));
  };

  if (status === "loading" || loadingConversations) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-sm text-slate-400">Loading chat…</div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-sm text-slate-400">Redirecting to login…</div>
      </div>
    );
  }

  const displayName =
    (session?.user?.name as string | undefined) ||
    (session?.user?.email as string | undefined) ||
    "User";

  const selectedLog = logs.find((l) => l.id === selectedLogId) ?? null;

  return (
    <div className="h-screen flex bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sidebar: conversations + settings */}
      <aside className="w-64 border-r border-slate-800 bg-slate-950/80 flex flex-col min-h-0">
        <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold truncate">{displayName}</div>
            <div className="text-xs text-slate-500">Veilfire Chat</div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowLogsPanel((prev) => !prev)}
              className="text-xs px-2 py-1 rounded-md border border-slate-700 hover:bg-slate-800"
            >
              {showLogsPanel ? "Hide logs" : "View logs"}
            </button>
            <button
              onClick={() =>
                signOut({
                  callbackUrl: "/auth/login",
                })
              }
              className="text-xs px-2 py-1 rounded-md border border-slate-700 hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-slate-800">
          <button
            onClick={handleNewConversation}
            className="w-full text-xs px-2 py-2 rounded-md bg-sky-600 hover:bg-sky-500"
          >
            + New conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto text-xs">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`flex items-center justify-between px-3 py-2 border-b border-slate-900 cursor-pointer ${
                c.id === activeId ? "bg-slate-900" : "hover:bg-slate-900/60"
              }`}
              onClick={() => setActiveId(c.id)}
            >
              <input
                className="bg-transparent text-xs flex-1 mr-2 outline-none"
                ref={(el) => {
                  titleInputRefs.current[c.id] = el;
                }}
                value={c.title}
                onChange={(e) => {
                  const title = e.target.value || "Untitled conversation";
                  setConversations((prev) =>
                    prev.map((conv) =>
                      conv.id === c.id ? { ...conv, title } : conv
                    )
                  );
                }}
                onBlur={() => {
                  const conv = conversations.find((conv) => conv.id === c.id);
                  if (conv) {
                    void persistConversation(conv);
                  }
                }}
              />
              <button
                className="text-slate-500 hover:text-red-400 ml-1"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDeleteConversation(c.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {activeConversation && (
          <div className="p-3 border-t border-slate-800 text-xs space-y-[10px] min-h-[220px] max-h-[220px]">
            <div>
              <label className="block mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                Model
              </label>
              <select
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1"
                value={activeConversation.settings.modelId}
                onChange={(e) =>
                  updateActiveConversation((conv) => ({
                    ...conv,
                    settings: {
                      ...conv.settings,
                      modelId: e.target.value,
                    },
                  }))
                }
              >
                {allModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wide text-slate-500">
                Context strategy
              </label>
              <select
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1"
                value={activeConversation.settings.context.strategy}
                onChange={(e) =>
                  updateActiveConversation((conv) => ({
                    ...conv,
                    settings: {
                      ...conv.settings,
                      context: {
                        ...conv.settings.context,
                        strategy: e.target.value as ContextStrategy,
                      },
                    },
                  }))
                }
              >
                <option value="full">Full conversation</option>
                <option value="lastN">Last N messages</option>
                <option value="approxTokens">Approx token limit</option>
              </select>
            </div>

            {activeConversation.settings.context.strategy === "lastN" && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">N messages</span>
                <input
                  type="number"
                  className="w-16 bg-slate-900 border border-slate-700 rounded-md px-1 py-0.5 text-right"
                  value={activeConversation.settings.context.lastN ?? 20}
                  onChange={(e) =>
                    updateActiveConversation((conv) => ({
                      ...conv,
                      settings: {
                        ...conv.settings,
                        context: {
                          ...conv.settings.context,
                          lastN: Number(e.target.value) || 1,
                        },
                      },
                    }))
                  }
                />
              </div>
            )}

            {activeConversation.settings.context.strategy ===
              "approxTokens" && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Max approx tokens
                </span>
                <input
                  type="number"
                  className="w-20 bg-slate-900 border border-slate-700 rounded-md px-1 py-0.5 text-right"
                  value={
                    activeConversation.settings.context.maxApproxTokens ?? 6000
                  }
                  onChange={(e) =>
                    updateActiveConversation((conv) => ({
                      ...conv,
                      settings: {
                        ...conv.settings,
                        context: {
                          ...conv.settings.context,
                          maxApproxTokens: Number(e.target.value) || 1000,
                        },
                      },
                    }))
                  }
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Temperature</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                className="w-16 bg-slate-900 border border-slate-700 rounded-md px-1 py-0.5 text-right"
                value={activeConversation.settings.temperature}
                onChange={(e) =>
                  updateActiveConversation((conv) => ({
                    ...conv,
                    settings: {
                      ...conv.settings,
                      temperature: Number(e.target.value),
                    },
                  }))
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="stream-toggle"
                type="checkbox"
                className="h-3 w-3"
                checked={activeConversation.settings.stream}
                onChange={(e) =>
                  updateActiveConversation((conv) => ({
                    ...conv,
                    settings: {
                      ...conv.settings,
                      stream: e.target.checked,
                    },
                  }))
                }
              />
              <label
                htmlFor="stream-toggle"
                className="text-[11px] text-slate-400"
              >
                Stream responses
              </label>
            </div>
          </div>
        )}
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col relative min-h-0">
        <button
          type="button"
          onClick={() => setShowConfigModal(true)}
          className="absolute top-4 right-5 z-10 rounded-full border border-slate-700 bg-slate-900/80 px-2 py-1 text-xs hover:bg-slate-800"
          aria-label="Open configuration"
        >
          ⚙
        </button>
        {activeConversation ? (
          <>
            {/* Messages */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm"
            >
              {activeConversation.messages.map((m) => {
                const isThinkingBubble =
                  isSending && m.role === "assistant" && !m.content;

                return (
                  <div
                    key={m.id}
                    className={`flex ${
                      m.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[70%] min-w-[12%] rounded-lg px-3 py-2 whitespace-pre-wrap ${
                        m.role === "user"
                          ? "bg-sky-600 text-white"
                          : m.role === "assistant"
                          ? "bg-slate-800 text-slate-100"
                          : "bg-amber-900/20 text-amber-100 border border-amber-700/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[10px] font-medium opacity-70">
                          {m.role.toUpperCase()}
                        </div>
                        <div className="flex items-center gap-2">
                          {isThinkingBubble &&
                            m.id === currentAssistantMessageId && (
                              <button
                                type="button"
                                className="text-[10px] text-red-300 hover:text-red-200 animate-pulse"
                                onClick={handleCancelRequest}
                              >
                                Cancel
                              </button>
                            )}
                          {m.role === "assistant" &&
                            m.id === currentAssistantMessageId &&
                            toolsUsedThisRun.includes("scratchpad") && (
                              <button
                                type="button"
                                className="ml-2 text-[10px] text-slate-300 hover:text-slate-100"
                                onClick={() => setScratchpadVisible(true)}
                              >
                                <svg
                                  className="w-3 h-3"
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <rect
                                    x="2.25"
                                    y="1.75"
                                    width="11.5"
                                    height="12.5"
                                    rx="1.5"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                  />
                                  <line
                                    x1="4"
                                    y1="5"
                                    x2="12"
                                    y2="5"
                                    stroke="currentColor"
                                    strokeWidth="1.2"
                                  />
                                  <line
                                    x1="4"
                                    y1="7.5"
                                    x2="10.5"
                                    y2="7.5"
                                    stroke="currentColor"
                                    strokeWidth="1.2"
                                  />
                                  <line
                                    x1="4"
                                    y1="10"
                                    x2="9"
                                    y2="10"
                                    stroke="currentColor"
                                    strokeWidth="1.2"
                                  />
                                </svg>
                              </button>
                            )}
                        </div>
                      </div>
                      {m.role === "assistant" ? (
                        isThinkingBubble ? (
                          <div className="flex flex-col gap-1 text-[12px] text-slate-200">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce [animation-duration:700ms]" />
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce [animation-delay:120ms] [animation-duration:700ms]" />
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce [animation-delay:240ms] [animation-duration:700ms]" />
                              </span>
                              <span>
                                Thinking...
                                {" "}
                                {(() => {
                                  const totalMs = Math.max(0, thinkingElapsedMs);
                                  const seconds = Math.floor(totalMs / 1000)
                                    .toString()
                                    .padStart(2, "0");
                                  const ms = (totalMs % 1000)
                                    .toString()
                                    .padStart(3, "0");
                                  return `(${seconds}.${ms})`;
                                })()}
                              </span>
                            </div>
                            {toolsUsedThisRun.length > 0 && (
                              <div className="text-[10px] text-slate-400">
                                Tool call: {toolsUsedThisRun.join(", ")}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="whitespace-normal">
                            <ReactMarkdown
                              components={{
                                p: (props) => (
                                  <p
                                    className="mb-0 leading-snug"
                                    {...props}
                                  />
                                ),
                                strong: (props) => (
                                  <strong
                                    className="font-semibold"
                                    {...props}
                                  />
                                ),
                                em: (props) => <em className="italic" {...props} />,
                                ul: (props) => (
                                  <ul
                                    className="list-disc ml-4 mb-1"
                                    {...props}
                                  />
                                ),
                                ol: (props) => (
                                  <ol
                                    className="list-decimal ml-4 mb-1"
                                    {...props}
                                  />
                                ),
                              }}
                            >
                              {m.content}
                            </ReactMarkdown>
                          </div>
                        )
                      ) : (
                        m.content
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input bar */}
            <div className="border-t border-slate-800 bg-slate-950/80 px-4 py-2 min-h-[220px] max-h-[220px]">
              <div className="flex items-center justify-between mb-2 text-xs text-slate-500">
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      className="h-3 w-3"
                      checked={sendOnEnter}
                      onChange={(e) => setSendOnEnter(e.target.checked)}
                    />
                    <span>Enter to send</span>
                  </label>
                  <span className="text-[11px]">
                    {!sendOnEnter
                      ? "⌘ or Ctrl + Enter to send; Enter = newline"
                      : "Enter to send; Shift+Enter = newline"}
                  </span>
                </div>
                <span className="text-[11px]">
                  Uploads: {uploadedFiles.length}
                </span>
              </div>

              {uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2 text-[11px]">
                  {uploadedFiles.map((f) => (
                    <span
                      key={f.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-800 text-slate-200"
                    >
                      {f.name}
                      <button
                        className="ml-1 text-slate-400 hover:text-red-400"
                        onClick={() =>
                          setUploadedFiles((prev) =>
                            prev.filter((u) => u.id !== f.id)
                          )
                        }
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-end min-h-[140px] gap-2">
                <textarea
                  className="flex-1 min-h-[175px] max-h-[1750px] bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="Send a message..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 h-9 w-9 cursor-pointer">
                    <span className="text-lg">📎</span>
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      onChange={handleFileChange}
                      accept=".txt,.csv,.pdf,.xlsx,.xls,image/*"
                    />
                  </label>
                  <button
                    onClick={() => void sendMessage()}
                    disabled={isSending || !input.trim()}
                    className="h-9 w-9 rounded-md bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 flex items-center justify-center"
                  >
                    {isSending ? "…" : "➤"}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            No conversation selected.
          </div>
        )}

        {/* Logs side panel */}
        {showLogsPanel && (
          <div
            className="absolute top-0 right-0 bottom-0 max-w-[40vw] border-l border-slate-800 bg-slate-950/95 backdrop-blur-sm shadow-xl flex flex-col min-h-0 overflow-hidden z-20"
            style={{ width: logsPanelWidth }}
          >
            <div
              className="absolute inset-y-0 left-0 w-2 cursor-col-resize bg-slate-800/40 hover:bg-slate-700/70 z-10"
              onMouseDown={handleLogsPanelResizeStart}
            />
            <div className="p-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold">Session logs</div>
                <div className="text-[11px] text-slate-500">
                  {activeConversation
                    ? `Conversation: ${activeConversation.title}`
                    : "No conversation selected"}
                </div>
              </div>
              <button
                className="text-xs px-2 py-1 rounded-md border border-slate-700 hover:bg-slate-800"
                onClick={() => setShowLogsPanel(false)}
              >
                Close
              </button>
            </div>

            <div className="flex-1 flex flex-col text-xs">
              <div className="relative border-b border-slate-800">
                <div
                  ref={logsListRef}
                  className="p-2 h-28 overflow-y-auto"
                  onScroll={updateScrollFlags}
                >
                  {logsLoading && (
                    <div className="text-[11px] text-slate-400">
                      Loading logs…
                    </div>
                  )}
                  {logsError && (
                    <div className="text-[11px] text-red-400">{logsError}</div>
                  )}
                  {!logsLoading && !logsError && logs.length === 0 && (
                    <div className="text-[11px] text-slate-500">
                      No logs for this conversation yet.
                    </div>
                  )}
                  {!logsLoading &&
                    !logsError &&
                    logs.map((log) => {
                      const date = new Date(log.createdAt);
                      const ts = isNaN(date.getTime())
                        ? String(log.createdAt)
                        : date.toLocaleString();
                      const lastUserMsg =
                        [...log.request.messages]
                          .reverse()
                          .find((m) => m.role === "user")?.content || "";
                      const preview =
                        lastUserMsg.length > 60
                          ? lastUserMsg.slice(0, 57) + "..."
                          : lastUserMsg;

                      return (
                        <button
                          key={log.id}
                          onClick={() => setSelectedLogId(log.id)}
                          className={`w-full text-left px-2 py-1 rounded-md mb-1 ${
                            log.id === selectedLogId
                              ? "bg-slate-800"
                              : "hover:bg-slate-900"
                          }`}
                        >
                          <div className="text-[10px] text-slate-400">{ts}</div>
                          <div className="text-[11px] truncate">
                            {preview || "(no user message)"}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {log.modelId}
                          </div>
                        </button>
                      );
                    })}
                </div>
                {logsListCanScrollUp && (
                  <div className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/80 border border-slate-700 w-5 h-5 flex items-center justify-center text-[10px] text-slate-300">
                    <span className="pl-px">↑</span>
                  </div>
                )}
                {logsListCanScrollDown && (
                  <div className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/80 border border-slate-700 w-5 h-5 flex items-center justify-center text-[10px] text-slate-300">
                    <span className="pl-px">↓</span>
                  </div>
                )}
              </div>

              <div className="relative flex-1 min-h-0">
                <div
                  ref={logsDetailRef}
                  className="absolute inset-0 overflow-y-auto p-3 space-y-3"
                  onScroll={updateScrollFlags}
                >
                  {selectedLog ? (
                    <>
                      <div>
                        <div className="text-[11px] font-semibold mb-1">
                          Overview
                        </div>
                        <div className="text-[11px] text-slate-300 space-y-0.5">
                          <div>
                            <span className="text-slate-500">Model: </span>
                            <span>{selectedLog.modelId}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Created: </span>
                            <span>
                              {new Date(selectedLog.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-semibold mb-1">
                          Prompts
                        </div>
                        <div className="space-y-1 ">
                          {selectedLog.request.systemPrompt && (
                            <div>
                              <div className="text-[10px] text-slate-500 mb-0.5">
                                System
                              </div>
                              <div className="text-[11px] bg-slate-900 border border-slate-800 rounded-md px-2 py-1 whitespace-pre-wrap">
                                {selectedLog.request.systemPrompt}
                              </div>
                            </div>
                          )}
                          {selectedLog.request.plannerPrompt && (
                            <div>
                              <div className="text-[10px] text-slate-500 mb-0.5">
                                Planner
                              </div>
                              <div className="text-[11px] bg-slate-900 border border-slate-800 rounded-md px-2 py-1 whitespace-pre-wrap">
                                {selectedLog.request.plannerPrompt}
                              </div>
                            </div>
                          )}
                          {selectedLog.request.reflectorPrompt && (
                            <div>
                              <div className="text-[10px] text-slate-500 mb-0.5">
                                Reflector
                              </div>
                              <div className="text-[11px] bg-slate-900 border border-slate-800 rounded-md px-2 py-1 whitespace-pre-wrap">
                                {selectedLog.request.reflectorPrompt}
                              </div>
                            </div>
                          )}
                          {!selectedLog.request.systemPrompt &&
                            !selectedLog.request.plannerPrompt &&
                            !selectedLog.request.reflectorPrompt && (
                              <div className="text-[11px] text-slate-500">
                                No extra prompts configured for this run.
                              </div>
                            )}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-semibold mb-1">
                          Context configuration
                        </div>
                        <div className="text-[11px] text-slate-300 space-y-0.5">
                          <div>
                            <span className="text-slate-500">Strategy: </span>
                            <span>{selectedLog.request.contextConfig.strategy}</span>
                          </div>
                          {selectedLog.request.contextConfig.strategy ===
                            "lastN" && (
                            <div>
                              <span className="text-slate-500">Last N: </span>
                              <span>
                                {selectedLog.request.contextConfig.lastN ?? 0}
                              </span>
                            </div>
                          )}
                          {selectedLog.request.contextConfig.strategy ===
                            "approxTokens" && (
                            <div>
                              <span className="text-slate-500">
                                Max approx tokens: {" "}
                              </span>
                              <span>
                                {selectedLog.request.contextConfig
                                  .maxApproxTokens ?? 0}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-semibold mb-1">
                          Request messages
                        </div>
                        <div className="space-y-1">
                          {selectedLog.request.messages.map((m) => (
                            <div
                              key={m.id}
                              className="bg-slate-900 border border-slate-800 rounded-md px-2 py-1"
                            >
                              <div className="text-[10px] text-slate-500 mb-0.5">
                                {m.role.toUpperCase()} • {" "}
                                {new Date(m.createdAt).toLocaleTimeString()}
                              </div>
                              <div className="text-[11px] whitespace-pre-wrap">
                                {m.content}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-semibold mb-1">
                          Response
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-[11px] whitespace-pre-wrap">
                          {selectedLog.response.content}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] text-slate-500">
                      Select a log entry above to inspect the full prompt /
                      response chain.
                    </div>
                  )}
                </div>
                {logsDetailCanScrollUp && (
                  <div className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/80 border border-slate-700 w-5 h-5 flex items-center justify-center text-[10px] text-slate-300">
                    <span className="pl-px">↑</span>
                  </div>
                )}
                {logsDetailCanScrollDown && (
                  <div className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/80 border border-slate-700 w-5 h-5 flex items-center justify-center text-[10px] text-slate-300">
                    <span className="pl-px">↓</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {activeConversation && scratchpadWidgetEnabled && scratchpadWidgetPos && (
        <div
          className="fixed z-40"
          style={{
            left: scratchpadWidgetPos.x,
            top: scratchpadWidgetPos.y,
          }}
        >
          <button
            type="button"
            onMouseDown={handleScratchpadWidgetDragStart}
            onClick={() => setScratchpadVisible((v) => !v)}
            className={`w-9 h-9 rounded-full bg-slate-950/90 border border-slate-700 shadow-lg flex items-center justify-center text-slate-200 text-xs active:scale-95 ${scratchpadWidgetPulse ? "animate-pulse" : ""}`}
            aria-label="Show scratchpad"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="2.25"
                y="1.75"
                width="11.5"
                height="12.5"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <line
                x1="4"
                y1="5"
                x2="12"
                y2="5"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <line
                x1="4"
                y1="7.5"
                x2="10.5"
                y2="7.5"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <line
                x1="4"
                y1="10"
                x2="9"
                y2="10"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          </button>
          {scratchpadVisible && (
            <div className="mt-2 w-72 max-w-[80vw] max-h-[60vh] rounded-lg border border-slate-700 bg-slate-950 shadow-xl text-xs text-slate-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">
                  AI Scratchpad
                </div>
                <button
                  type="button"
                  className="text-[11px] text-slate-400 hover:text-slate-200"
                  onClick={() => setScratchpadVisible(false)}
                >
                  Close
                </button>
              </div>
              <div className="max-h-[48vh] overflow-y-auto whitespace-pre-wrap text-[11px]">
                {scratchpad}
              </div>
            </div>
          )}
        </div>
      )}

      {showConfigModal && activeConversation && (
        <div className="fixed inset-0 z-40 bg-slate-950/95 backdrop-blur-sm flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Configuration</div>
              <div className="text-xs text-slate-500">
                Prompts, models, and provider settings
              </div>
            </div>
            <button
              onClick={() => setShowConfigModal(false)}
              className="text-xs px-2 py-1 rounded-md border border-slate-700 hover:bg-slate-800"
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">
                    Prompt preset
                  </span>
                  <select
                    className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
                    value={selectedPresetId}
                    onChange={(e) => handleApplyPreset(e.target.value)}
                  >
                    <option value="">None</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] w-32"
                    type="text"
                    placeholder="Preset name"
                    value={presetNameInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const sanitized = raw
                        .replace(/[^A-Za-z0-9 _-]/g, "")
                        .slice(0, 32);
                      setPresetNameInput(sanitized);
                    }}
                  />
                  <button
                    onClick={handleSavePreset}
                    className="rounded-md border border-slate-700 px-2 py-1 text-[11px] hover:bg-slate-800"
                  >
                    Save as preset
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div>
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">
                      System prompt
                    </span>
                    <textarea
                      className="mt-1 w-full min-h-[240px] bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
                      value={activeConversation.settings.systemPrompt}
                      onChange={(e) =>
                        updateActiveConversation((conv) => ({
                          ...conv,
                          settings: {
                            ...conv.settings,
                            systemPrompt: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">
                      Planner instructions
                    </span>
                    <textarea
                      className="mt-1 w-full min-h-[240px] bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
                      placeholder="High-level planning / decomposition guidance..."
                      value={activeConversation.settings.plannerPrompt}
                      onChange={(e) =>
                        updateActiveConversation((conv) => ({
                          ...conv,
                          settings: {
                            ...conv.settings,
                            plannerPrompt: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <span className="text-[11px] uppercase tracking-wide text-slate-500">
                      Reflector / self-critique
                    </span>
                    <textarea
                      className="mt-1 w-full min-h-[240px] bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
                      placeholder="E.g. ask the model to critique its own reasoning..."
                      value={activeConversation.settings.reflectorPrompt}
                      onChange={(e) =>
                        updateActiveConversation((conv) => ({
                          ...conv,
                          settings: {
                            ...conv.settings,
                            reflectorPrompt: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                  OpenRouter API key
                </div>
                <div className="space-y-1">
                  {userSettingsLoading ? (
                    <div className="text-[11px] text-slate-500">
                      Loading settings…
                    </div>
                  ) : (
                    <>
                      <div className="text-[11px] text-slate-400">
                        {userSettings?.hasApiKey
                          ? userSettings.apiKeyLast4
                            ? `Key configured (ending in ${userSettings.apiKeyLast4}).`
                            : "Key configured."
                          : "No user-specific key stored. The server environment key will be used if configured."}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="password"
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
                          placeholder="Enter new OpenRouter API key"
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                        />
                        <button
                          onClick={() => void handleSaveApiKey()}
                          disabled={apiKeySaving || !apiKeyInput.trim()}
                          className="text-xs px-2 py-1 rounded-md border border-slate-700 hover:bg-slate-800 disabled:opacity-60"
                        >
                          Save
                        </button>
                        {userSettings?.hasApiKey && (
                          <button
                            onClick={() => void handleClearApiKey()}
                            disabled={apiKeySaving}
                            className="text-xs px-2 py-1 rounded-md border border-red-700 text-red-300 hover:bg-red-900/40 disabled:opacity-60"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      {userSettingsError && (
                        <div className="text-[11px] text-red-400">
                          {userSettingsError}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                  Your models
                </div>
                <div className="text-[11px] text-slate-400 mb-1">
                  These models appear in the chat sidebar.
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1 border border-slate-800 rounded-md p-2 bg-slate-950/60">
                  {allModels.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="text-[11px]">
                          {m.label}
                          {selectedModel && selectedModel.id === m.id && (
                            <span className="ml-1 text-[10px] text-sky-400">
                              (selected)
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {m.provider ?? "provider unknown"} • {m.id}
                          {m.contextWindow
                            ? ` • ${m.contextWindow.toLocaleString()} tokens`
                            : ""}
                        </div>
                      </div>
                      {m.origin === "custom" && (
                        <button
                          onClick={() => void handleRemoveCustomModel(m.id)}
                          className="text-[10px] px-2 py-0.5 rounded-md border border-slate-700 hover:bg-slate-800"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  {allModels.length === 0 && (
                    <div className="text-[11px] text-slate-500">
                      No models configured.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">
                    Browse OpenRouter models
                  </span>
                  {openRouterModelsLoading && (
                    <span className="text-[10px] text-slate-400">
                      Loading…
                    </span>
                  )}
                </div>
                {openRouterModelsError && (
                  <div className="text-[11px] text-red-400 mb-1">
                    {openRouterModelsError}
                  </div>
                )}
                <input
                  type="text"
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs"
                  placeholder="Search by name or id..."
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                />
                <div className="mt-2 min-h-[32lh] max-h-[42lh] overflow-y-hidden overflow-y-scroll space-y-1 border border-slate-800 rounded-md p-2 bg-slate-950/60">
                  {openRouterModels
                    .filter((m) => {
                      const q = modelSearch.trim().toLowerCase();
                      if (!q) return true;
                      const haystack = `${m.label} ${m.id} ${
                        m.provider ?? ""
                      }`.toLowerCase();
                      return haystack.includes(q);
                    })
                    .slice(0, 50)
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="text-[11px] font-medium">
                            {m.label}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {m.provider ?? "provider"} • {m.id}
                            {m.contextWindow
                              ? ` • ${m.contextWindow.toLocaleString()} tokens`
                              : ""}
                          </div>
                        </div>
                        <button
                          onClick={() => void handleAddCustomModel(m)}
                          className="text-[10px] px-2 py-0.5 rounded-md border border-slate-700 hover:bg-slate-800"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  {!openRouterModelsLoading && openRouterModels.length === 0 && (
                    <div className="text-[11px] text-slate-500">
                      No models loaded yet. Ensure an OpenRouter API key is
                      configured.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useCallback, useRef, useEffect } from "react";

import type { ChatMessage, ChatAction } from "@/types";

/* ============================================
   Constants
   ============================================ */

const STORAGE_KEY = "melisso-chat";
const MAX_SESSION_MESSAGES = 30;
const DEBOUNCE_MS = 1_000;
const MAX_INPUT_LENGTH = 500;

/* ============================================
   Action parser
   ============================================ */

const ACTION_REGEX = /<!--action:(.*?)-->/g;

const parseActions = (content: string): { cleanContent: string; actions: ChatAction[] } => {
  const actions: ChatAction[] = [];

  const cleanContent = content.replace(ACTION_REGEX, (_, json: string) => {
    try {
      const parsed = JSON.parse(json) as ChatAction;
      if (parsed.type === "navigate" && parsed.target && parsed.label) {
        actions.push(parsed);
      }
    } catch {
      /* ignore malformed actions */
    }
    return "";
  }).trim();

  return { cleanContent, actions };
};

/* ============================================
   Session persistence
   ============================================ */

interface StoredChat {
  locale: string;
  messages: ChatMessage[];
}

const loadFromStorage = (currentLocale: string): ChatMessage[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw) as StoredChat;
    /* Discard if locale changed */
    if (stored.locale !== currentLocale) {
      sessionStorage.removeItem(STORAGE_KEY);
      return [];
    }
    return stored.messages;
  } catch {
    return [];
  }
};

const saveToStorage = (messages: ChatMessage[], locale: string) => {
  try {
    const data: StoredChat = { locale, messages };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* sessionStorage full — silently ignore */
  }
};

/* ============================================
   Hook
   ============================================ */

interface UseChatOptions {
  locale: string;
  welcomeMessage: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isOpen: boolean;
  isLoading: boolean;
  hasNewMessage: boolean;
  limitReached: boolean;
  sendMessage: (text: string) => Promise<void>;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
}

export const useChat = ({ locale, welcomeMessage }: UseChatOptions): UseChatReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const lastSendTime = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  /* --- Restore from sessionStorage on mount (discards if locale differs) --- */
  useEffect(() => {
    const stored = loadFromStorage(locale);
    if (stored.length > 0) {
      setMessages(stored);
    }
    setInitialized(true);
  }, [locale]);

  /* --- Persist on change --- */
  useEffect(() => {
    if (initialized && messages.length > 0) {
      saveToStorage(messages, locale);
    }
  }, [messages, initialized, locale]);

  /* --- Insert welcome message on first open --- */
  const ensureWelcome = useCallback(() => {
    setMessages((prev) => {
      if (prev.length > 0) return prev;
      return [{ role: "assistant", content: welcomeMessage }];
    });
  }, [welcomeMessage]);

  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const limitReached = userMessageCount >= MAX_SESSION_MESSAGES;

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim().slice(0, MAX_INPUT_LENGTH);
    if (!trimmed || isLoading || limitReached) return;

    /* --- Debounce --- */
    const now = Date.now();
    if (now - lastSendTime.current < DEBOUNCE_MS) return;
    lastSendTime.current = now;

    /* --- Cancel previous stream if any --- */
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMessage: ChatMessage = { role: "user", content: trimmed };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const allMessages = [...messages, userMessage];
      const apiMessages = allMessages.map(({ role, content }) => ({ role, content }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, locale }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("API error");
      }

      /* --- Stream reading --- */
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      /* Add empty assistant message */
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;

        /* Update last assistant message with accumulated text */
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          updated[lastIdx] = { ...updated[lastIdx], content: accumulated };
          return updated;
        });
      }

      /* --- Parse actions from final content --- */
      const { cleanContent, actions } = parseActions(accumulated);

      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        updated[lastIdx] = {
          ...updated[lastIdx],
          content: cleanContent,
          actions: actions.length > 0 ? actions : undefined,
        };
        return updated;
      });

      if (!isOpen) {
        setHasNewMessage(true);
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;

      /* Replace empty assistant message with error */
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.role === "assistant" && !updated[lastIdx].content) {
          updated[lastIdx] = {
            ...updated[lastIdx],
            content: locale === "pt"
              ? "Ops, algo deu errado. Tente novamente em alguns segundos 🐱"
              : "Oops, something went wrong. Try again in a few seconds 🐱",
          };
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [messages, isLoading, limitReached, locale, isOpen]);

  const openChat = useCallback(() => {
    setIsOpen(true);
    setHasNewMessage(false);
    ensureWelcome();
  }, [ensureWelcome]);

  const closeChat = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleChat = useCallback(() => {
    if (isOpen) {
      closeChat();
    } else {
      openChat();
    }
  }, [isOpen, openChat, closeChat]);

  return {
    messages,
    isOpen,
    isLoading,
    hasNewMessage,
    limitReached,
    sendMessage,
    openChat,
    closeChat,
    toggleChat,
  };
};

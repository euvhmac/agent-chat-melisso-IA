"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useLenis } from "lenis/react";

import { useChat } from "@/hooks/use-chat";
import { HEADER_HEIGHT } from "@/lib/constants";
import { ChatBubble } from "@/components/layout/chat-bubble";
import { ChatWindow } from "@/components/layout/chat-window";
import type { ChatAction } from "@/types";

/**
 * Orchestrator: monta ChatBubble + ChatWindow,
 * controla visibilidade baseada em scroll (past hero),
 * e despacha ações de navegação via Lenis.
 */
export const ChatWidget = () => {
  const t = useTranslations("chat");
  const locale = useLocale();
  const lenis = useLenis();

  const [hasAppeared, setHasAppeared] = useState(false);
  const [proactiveNotification, setProactiveNotification] = useState(false);
  const proactiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    messages,
    isOpen,
    isLoading,
    hasNewMessage,
    limitReached,
    sendMessage,
    openChat,
    closeChat,
    toggleChat,
  } = useChat({
    locale,
    welcomeMessage: t("welcome"),
  });

  /* --- Detect scroll past Hero (once visible, stays visible) --- */
  useEffect(() => {
    const heroEl = document.getElementById("hero");
    if (!heroEl) {
      setHasAppeared(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          setHasAppeared(true);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(heroEl);
    return () => observer.disconnect();
  }, []);

  /* --- Proactive notification: show badge after 5s if never opened --- */
  useEffect(() => {
    if (!hasAppeared || isOpen || messages.length > 0) return;

    proactiveTimerRef.current = setTimeout(() => {
      if (!isOpen) {
        setProactiveNotification(true);
      }
    }, 2_000);

    return () => {
      if (proactiveTimerRef.current) clearTimeout(proactiveTimerRef.current);
    };
  }, [hasAppeared, isOpen, messages.length]);

  /* --- Navigation action handler --- */
  const handleAction = (action: ChatAction) => {
    if (action.type !== "navigate") return;

    const sectionId = action.target.replace("#", "");
    const sectionEl = document.getElementById(sectionId);

    const applyFilter = () => {
      if (action.filter) {
        window.dispatchEvent(
          new CustomEvent("melisso:filter", {
            detail: { section: action.target, filter: action.filter },
          }),
        );
      }
    };

    if (lenis && sectionEl) {
      lenis.scrollTo(sectionEl, {
        offset: -HEADER_HEIGHT,
        duration: 1.2,
        onComplete: applyFilter,
      });
    } else if (sectionEl) {
      /* Fallback: native scroll */
      const top = sectionEl.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT;
      window.scrollTo({ top, behavior: "smooth" });
      setTimeout(applyFilter, 800);
    }

    /* Close chat after navigation on mobile */
    if (window.innerWidth < 768) {
      closeChat();
    }
  };

  const suggestedPrompts = [
    t("suggestedPrompts.0"),
    t("suggestedPrompts.1"),
    t("suggestedPrompts.2"),
  ];

  const handleOpen = () => {
    setProactiveNotification(false);
    openChat();
  };

  const showBubble = hasAppeared && !isOpen;
  const showBadge = hasNewMessage || proactiveNotification;

  return (
    <>
      <ChatBubble
        onClick={handleOpen}
        hasNewMessage={showBadge}
        visible={showBubble}
        ariaLabel={t("open")}
      />

      {isOpen && (
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          limitReached={limitReached}
          onSend={sendMessage}
          onClose={closeChat}
          onAction={handleAction}
          suggestedPrompts={suggestedPrompts}
          translations={{
            placeholder: t("placeholder"),
            send: t("send"),
            close: t("close"),
            online: t("online"),
            typing: t("typing"),
            limitReached: t("limitReached"),
          }}
        />
      )}
    </>
  );
};

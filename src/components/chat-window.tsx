"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { X, Send, ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { ChatMessage, ChatAction } from "@/types";

/* ============================================
   Sub-components
   ============================================ */

const TypingIndicator = () => (
  <div className="flex items-center gap-1 px-3 py-2" aria-label="Typing...">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce"
        style={{ animationDelay: `${i * 150}ms` }}
      />
    ))}
  </div>
);

interface ActionButtonProps {
  action: ChatAction;
  onAction: (action: ChatAction) => void;
}

const ActionButton = ({ action, onAction }: ActionButtonProps) => (
  <button
    onClick={() => onAction(action)}
    className={cn(
      "mt-1 inline-flex items-center gap-1.5 rounded-full",
      "border border-primary/30 bg-primary/5 px-3 py-1",
      "font-mono text-[11px] text-primary transition-colors",
      "hover:bg-primary/10 hover:border-primary/50",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    )}
  >
    {action.label}
    <ArrowRight className="h-3 w-3" />
  </button>
);

/* ============================================
   ChatWindow Props
   ============================================ */

interface ChatWindowProps {
  messages: ChatMessage[];
  isLoading: boolean;
  limitReached: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
  onAction: (action: ChatAction) => void;
  suggestedPrompts: string[];
  translations: {
    placeholder: string;
    send: string;
    close: string;
    online: string;
    typing: string;
    limitReached: string;
  };
}

/* ============================================
   ChatWindow Component
   ============================================ */

export const ChatWindow = ({
  messages,
  isLoading,
  limitReached,
  onSend,
  onClose,
  onAction,
  suggestedPrompts,
  translations: t,
}: ChatWindowProps) => {
  const prefersReducedMotion = useReducedMotion();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");

  const hasUserMessages = messages.some((m) => m.role === "user");
  const charCount = inputValue.length;
  const maxChars = 500;

  /* --- Auto-scroll to bottom --- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [messages, isLoading, prefersReducedMotion]);

  /* --- Focus input on open --- */
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  /* --- Keyboard: Esc to close --- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  /* --- Send handler --- */
  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading || limitReached) return;
    onSend(trimmed);
    setInputValue("");
  }, [inputValue, isLoading, limitReached, onSend]);

  /* --- Textarea key handler --- */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* --- Auto-resize textarea --- */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value.slice(0, maxChars);
    setInputValue(value);

    /* Auto-resize */
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 72)}px`;
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={windowRef}
        role="dialog"
        aria-label="Chat with Melisso"
        initial={{
          opacity: 0,
          scale: prefersReducedMotion ? 1 : 0.9,
          y: prefersReducedMotion ? 0 : 20,
          transformOrigin: "bottom right",
        }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{
          opacity: 0,
          scale: prefersReducedMotion ? 1 : 0.9,
          y: prefersReducedMotion ? 0 : 20,
        }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "fixed bottom-6 right-6 z-50",
          "flex h-[70vh] max-h-[520px] w-[calc(100vw-2rem)] flex-col",
          "rounded-2xl border border-border/50 bg-background/95 shadow-2xl backdrop-blur-md",
          "sm:w-[380px]",
          "md:bottom-8 md:right-8",
        )}
      >
        {/* ---- Header ---- */}
        <div className="flex items-center gap-3 border-b border-border/30 px-4 py-3">
          <div className="relative h-8 w-8 overflow-hidden rounded-full">
            <Image
              src="/images/melisso-avatar.jpeg"
              alt="Melisso"
              fill
              sizes="32px"
              className="object-cover"
            />
          </div>

          <div className="flex-1">
            <h2 className="font-heading text-sm font-semibold text-text-primary">Melisso</h2>
            <p className="flex items-center gap-1 text-[11px] text-text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {isLoading ? t.typing : t.online}
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label={t.close}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full",
              "text-text-muted transition-colors hover:bg-surface hover:text-text-primary",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ---- Messages ---- */}
        <div
          role="log"
          aria-live="polite"
          className="flex-1 space-y-3 overflow-y-auto px-4 py-3 scrollbar-thin"
        >
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn(
                "flex gap-2",
                msg.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {/* Assistant avatar */}
              {msg.role === "assistant" && (
                <div className="mt-1 h-6 w-6 flex-shrink-0 overflow-hidden rounded-full">
                  <div className="relative h-full w-full">
                    <Image
                      src="/images/melisso-avatar.jpeg"
                      alt=""
                      fill
                      sizes="24px"
                      className="object-cover"
                    />
                  </div>
                </div>
              )}

              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "rounded-br-md bg-primary/10 text-text-primary"
                    : "rounded-bl-md bg-surface text-text-primary",
                )}
              >
                {/* Whitespace-pre-wrap for line breaks */}
                <p className="whitespace-pre-wrap">{msg.content}</p>

                {/* Action buttons */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {msg.actions.map((action, actionIdx) => (
                      <ActionButton key={actionIdx} action={action} onAction={onAction} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-2">
              <div className="mt-1 h-6 w-6 flex-shrink-0 overflow-hidden rounded-full">
                <div className="relative h-full w-full">
                  <Image
                    src="/images/melisso-avatar.jpeg"
                    alt=""
                    fill
                    sizes="24px"
                    className="object-cover"
                  />
                </div>
              </div>
              <div className="rounded-2xl rounded-bl-md bg-surface">
                <TypingIndicator />
              </div>
            </div>
          )}

          {/* Suggested prompts */}
          {!hasUserMessages && messages.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => onSend(prompt)}
                  className={cn(
                    "rounded-full border border-border/50 bg-surface/50 px-3 py-1.5",
                    "font-mono text-[11px] text-text-secondary transition-all",
                    "hover:border-primary/30 hover:text-text-primary",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  )}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ---- Input ---- */}
        <div className="border-t border-border/30 px-4 py-3">
          {limitReached ? (
            <p className="text-center text-xs text-text-muted">{t.limitReached}</p>
          ) : (
            <div className="flex items-end gap-2">
              <div className="relative flex-1">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={t.placeholder}
                  rows={1}
                  disabled={isLoading}
                  className={cn(
                    "w-full resize-none rounded-xl border border-border/50 bg-surface/50",
                    "px-3 py-2 pr-10 text-sm text-text-primary placeholder:text-text-muted",
                    "transition-colors focus:border-primary/50 focus:outline-none",
                    "disabled:opacity-50",
                    "scrollbar-thin",
                  )}
                  style={{ maxHeight: 72 }}
                />
                {/* Char counter */}
                {charCount > 0 && (
                  <span
                    className={cn(
                      "absolute bottom-1 right-2 text-[10px]",
                      charCount > maxChars * 0.9 ? "text-red-400" : "text-text-muted",
                    )}
                  >
                    {charCount}/{maxChars}
                  </span>
                )}
              </div>

              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                aria-label={t.send}
                className={cn(
                  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl",
                  "bg-primary text-primary-foreground transition-all",
                  "hover:bg-primary/90 active:scale-95",
                  "disabled:opacity-30 disabled:cursor-not-allowed",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

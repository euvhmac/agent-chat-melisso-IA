"use client";

import dynamic from "next/dynamic";

const ChatWidget = dynamic(
  () => import("@/components/layout/chat-widget").then((m) => m.ChatWidget),
  { ssr: false },
);

/**
 * Wrapper client para carregar o ChatWidget com ssr: false.
 * Necessário porque o layout raiz é Server Component.
 */
export const ChatWidgetLoader = () => <ChatWidget />;

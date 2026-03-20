"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

interface ChatBubbleProps {
  onClick: () => void;
  hasNewMessage: boolean;
  visible: boolean;
  ariaLabel: string;
}

export const ChatBubble = ({ onClick, hasNewMessage, visible, ariaLabel }: ChatBubbleProps) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ scale: prefersReducedMotion ? 1 : 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: prefersReducedMotion ? 1 : 0, opacity: 0 }}
          transition={
            prefersReducedMotion
              ? { duration: 0.2 }
              : { type: "spring", stiffness: 260, damping: 20 }
          }
          onClick={onClick}
          aria-label={ariaLabel}
          className={cn(
            "fixed bottom-6 right-6 z-50",
            "flex h-14 w-14 items-center justify-center rounded-full",
            "border-2 border-primary/30 bg-surface shadow-lg",
            "transition-shadow duration-300 hover:shadow-primary/20 hover:shadow-xl",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "md:bottom-8 md:right-8 md:h-16 md:w-16",
          )}
        >
          {/* Avatar */}
          <div className="relative h-10 w-10 overflow-hidden rounded-full md:h-12 md:w-12">
            <Image
              src="/images/melisso-avatar.jpeg"
              alt="Melisso"
              fill
              sizes="48px"
              className="object-cover"
            />
          </div>

          {/* Notification badge */}
          {hasNewMessage && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center md:top-0 md:right-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-primary shadow-sm" />
            </span>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
};

import Anthropic from "@anthropic-ai/sdk";

import { MELISSO_SYSTEM_PROMPT } from "@/lib/melisso-context";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ChatApiRequest } from "@/types";

/* ============================================
   Validation
   ============================================ */

const MAX_MESSAGE_LENGTH = 500;
const MAX_MESSAGES = 30;
const SLIDING_WINDOW = 10;

const stripHtml = (text: string): string =>
  text.replace(/<[^>]*>/g, "").trim();

const validateRequest = (
  body: unknown,
): { valid: true; data: ChatApiRequest } | { valid: false; error: string } => {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid request body" };
  }

  const { messages, locale } = body as Record<string, unknown>;

  if (!Array.isArray(messages) || messages.length === 0) {
    return { valid: false, error: "Messages array is required" };
  }

  if (messages.length > MAX_MESSAGES) {
    return { valid: false, error: "Too many messages" };
  }

  if (typeof locale !== "string" || !["pt", "en"].includes(locale)) {
    return { valid: false, error: "Invalid locale" };
  }

  for (const msg of messages) {
    if (
      typeof msg !== "object" ||
      !msg ||
      !["user", "assistant"].includes(msg.role) ||
      typeof msg.content !== "string"
    ) {
      return { valid: false, error: "Invalid message format" };
    }

    if (msg.role === "user" && msg.content.length > MAX_MESSAGE_LENGTH) {
      return { valid: false, error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters` };
    }
  }

  return {
    valid: true,
    data: {
      messages: messages.map((m: { role: "user" | "assistant"; content: string }) => ({
        role: m.role,
        content: m.role === "user" ? stripHtml(m.content) : m.content,
      })),
      locale: locale as string,
    },
  };
};

/* ============================================
   POST Handler
   ============================================ */

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "Chat service unavailable" },
      { status: 503 },
    );
  }

  /* --- Rate Limit (Upstash Redis — burst + hourly + daily) --- */
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";

  const { limited, retryAfter } = await checkRateLimit(ip);

  if (limited) {
    return Response.json(
      { error: "Too many requests. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter ?? 60) },
      },
    );
  }

  /* --- Validate --- */
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validation = validateRequest(body);
  if (!validation.valid) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const { messages, locale } = validation.data;

  /* --- Sliding window: only send last N messages --- */
  const windowedMessages = messages.slice(-SLIDING_WINDOW);

  /* --- Stream from Claude --- */
  const client = new Anthropic({ apiKey });

  try {
    const stream = await client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      temperature: 1,
      thinking: { type: "disabled" },
      system: `${MELISSO_SYSTEM_PROMPT}\n\nIdioma do usuário: ${locale === "pt" ? "Português (BR)" : "English"}. Responda neste idioma.`,
      messages: windowedMessages,
    });

    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch {
          controller.enqueue(
            new TextEncoder().encode("\n[ERROR]"),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "Failed to generate response" },
      { status: 500 },
    );
  }
}

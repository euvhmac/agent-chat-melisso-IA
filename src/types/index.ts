/* ============================================
   Melisso Chat — Type Definitions
   ============================================ */

/** Ação de navegação emitida pelo chatbot */
export interface ChatAction {
  type: "navigate";
  target: string;
  filter?: string;
  label: string;
}

/** Mensagem individual do chat */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: ChatAction[];
}

/** Payload enviado para a API /api/chat */
export interface ChatApiRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  locale: string;
}

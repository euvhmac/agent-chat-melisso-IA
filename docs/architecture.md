# Arquitetura — Melisso Chat Agent

## Visão Macro

O Melisso segue uma arquitetura **client-server streaming** otimizada para UX em tempo real:

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                     │
│                                                         │
│  ChatWidgetLoader ─► ChatWidget (orchestrator)          │
│       │                    │                            │
│       │              ┌─────┴──────┐                     │
│       │              │            │                     │
│  ChatBubble    ChatWindow    useChat()                  │
│  (FAB)         (Messages)    (State + Stream)           │
│                                   │                     │
│                          fetch + AbortController        │
└───────────────────────────┬─────────────────────────────┘
                            │ POST /api/chat
                            │ { messages[], locale }
                            ▼
┌───────────────────────────────────────────────────────────┐
│                    SERVER (Edge/Node)                      │
│                                                           │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────┐ │
│  │ Validate  │──►│  Rate Limit  │──►│  Claude Haiku    │ │
│  │ + Sanitize│   │  (3 layers)  │   │  4.5 (stream)    │ │
│  └──────────┘   └──────┬───────┘   └────────┬─────────┘ │
│                         │                     │           │
│                  ┌──────▼───────┐    ┌────────▼─────────┐│
│                  │ Upstash Redis│    │  ReadableStream   ││
│                  │ (serverless) │    │  (text/plain)     ││
│                  └──────────────┘    └──────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

## Camada por Camada

### 1. ChatWidgetLoader (Entry Point)

**Responsabilidade:** Carregamento lazy do widget inteiro.

- Usa `next/dynamic` com `ssr: false` — zero impacto no SSR/SSG
- Importa `ChatWidget` apenas no browser após hydration
- Garante que nenhum código do chat entra no bundle do servidor

### 2. ChatWidget (Orchestrator)

**Responsabilidade:** Orquestrar visibilidade e comportamento.

- **Scroll detection**: IntersectionObserver no `#hero` — widget aparece após hero sair da viewport
- **Proactive notification**: Timer de 2s para mostrar badge se nunca abriu
- **Navigation actions**: Parseia ações do chatbot e executa scroll via Lenis (ou fallback nativo)
- **Filter dispatch**: Emite `CustomEvent("melisso:filter")` quando chatbot sugere filtro de projetos

### 3. ChatBubble (FAB)

**Responsabilidade:** Botão flutuante com avatar.

- Animação de entrada spring (Framer Motion)
- Badge de notificação com `animate-ping`
- Respeita `prefers-reduced-motion`

### 4. ChatWindow (Messages UI)

**Responsabilidade:** Interface de mensagens completa.

- Auto-scroll para bottom em novas mensagens
- Typing indicator com dots animados
- Action buttons parseados das respostas do LLM
- Suggested prompts na abertura
- Textarea auto-resize com contador de caracteres
- Keyboard: `Enter` envia, `Esc` fecha

### 5. useChat (State Management)

**Responsabilidade:** Toda a lógica de estado e comunicação.

- **Session storage**: Persiste mensagens por sessão (limpa ao fechar aba)
- **Locale awareness**: Descarta sessão se idioma mudar
- **Streaming**: Lê `ReadableStream` via `reader.read()` com `TextDecoder`
- **Action parsing**: Regex `<!--action:{...}-->` extrai botões de navegação
- **Abort controller**: Cancela stream anterior ao novo envio
- **Debounce**: 1s entre envios para prevenir spam
- **Limit tracking**: Max 30 mensagens de usuário por sessão

### 6. API Route (Server)

**Responsabilidade:** Validação, rate limiting e proxy para Claude.

Pipeline:
1. Extrai IP (`x-forwarded-for` → fallback `unknown`)
2. Verifica 3 camadas de rate limit em paralelo
3. Parseia e valida body (tipos, lengths, format)
4. Sanitiza input (strip HTML)
5. Aplica sliding window (últimas 10 msgs)
6. Envia para Claude com system prompt + locale
7. Retorna `ReadableStream` (text/plain, no-cache)

### 7. Rate Limiter (3 Layers)

**Responsabilidade:** Proteção multi-camada do budget de tokens.

```
Burst:   5 msgs / 10s  → Bloqueia bots e curl loops
Hourly: 20 msgs / 1h   → Limite generoso para uso real
Daily:  50 msgs / 24h  → Cap final para proteção de custos
```

Algoritmo: **Sliding Window** (Upstash) — mais preciso que Fixed Window, sem bursts nas fronteiras.

### 8. System Prompt (Context Engineering)

**Responsabilidade:** Definir persona, dados e comportamento do LLM.

Estrutura (~800 tokens):
- Persona do Melisso (gato real, história do nome)
- Regras de personalidade (conciso, emoji moderado, honesto)
- `VICTOR_CONTEXT` em JSON (dados profissionais completos)
- Instruções de navegação (formato de action tags)
- Guardrails (escopo, redirecionamento, sem invenções)

## Decisões de Design

| Decisão | Alternativa considerada | Por que esta |
|---------|------------------------|-------------|
| ReadableStream nativo | AI SDK streaming | Zero deps adicionais, controle total |
| sessionStorage | localStorage | Limpa automaticamente, sem dados persistentes |
| 3 camadas rate limit | 1 camada única | Proteção granular (burst ≠ daily) |
| Sliding window (msgs) | Enviar tudo | Economia de tokens, latência menor |
| Action tags no texto | Structured output | Simples, funciona com streaming, parsável |
| AbortController | Ignorar concorrência | Previne race conditions e respostas fantasma |
| IntersectionObserver | Scroll event | Performance, sem debounce manual necessário |

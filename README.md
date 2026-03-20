# 🐱 Melisso — AI Chat Agent

> Agente conversacional inteligente construído com **Claude Haiku 4.5**, streaming em tempo real, rate limiting em 3 camadas e suporte multilíngue. Integrado como widget flutuante em um portfólio Next.js.

**[Demo ao vivo →](https://vhmac.com)**

---

## 📋 Visão Geral

O **Melisso** é um assistente de IA com persona de gato 🐱 que guia visitantes pelo portfólio de Victor Campos. Ele responde perguntas sobre projetos, experiência profissional, habilidades técnicas e informações de contato — tudo via chat fluido com streaming em tempo real.

### Por que este projeto é relevante

- **Streaming real**: Respostas aparecem palavra por palavra via `ReadableStream`, sem polling
- **Rate limiting serverless**: 3 camadas (burst/hourly/daily) com Upstash Redis, sem infraestrutura
- **Segurança**: Input sanitization, validação rigorosa, HTML stripping, abort controllers
- **UX avançada**: Typing indicators, ações navegáveis, prompts sugeridos, session persistence
- **i18n nativo**: Português e inglês com detecção automática de idioma
- **Performance**: Lazy loading (SSR=false), sliding window de contexto, debounce anti-spam

---

## 🏛️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  ChatBubble   │    │  ChatWindow   │    │  ChatWidget   │  │
│  │  (FAB + badge)│◄──►│  (messages UI)│◄──►│ (orchestrator)│  │
│  └──────────────┘    └──────┬───────┘    └──────┬───────┘  │
│                             │                    │          │
│                      ┌──────▼───────┐           │          │
│                      │   useChat()   │◄──────────┘          │
│                      │ (state+stream)│                      │
│                      └──────┬───────┘                      │
│                             │ fetch + AbortController       │
└─────────────────────────────┼───────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   API /api/chat    │
                    │   (POST + Stream)  │
                    └─────────┬─────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     ┌────────▼───────┐ ┌────▼────┐ ┌────────▼───────┐
     │  Input Validate │ │  Rate   │ │  Claude Haiku  │
     │  (sanitize+cap) │ │  Limit  │ │  4.5 (stream)  │
     └────────────────┘ │ 3-layer │ └────────────────┘
                        └─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Upstash Redis   │
                    │  (sliding window) │
                    └───────────────────┘
```

### Fluxo de uma mensagem

1. **Usuário digita** → `ChatWindow` captura input (max 500 chars, debounce 1s)
2. **`useChat()` processa** → Cancela stream anterior (AbortController), adiciona ao state
3. **`POST /api/chat`** → Valida request, verifica 3 camadas de rate limit
4. **Claude Haiku 4.5** → Recebe sliding window (últimas 10 msgs) + system prompt
5. **Streaming** → Chunks de texto fluem via `ReadableStream` → `TextDecoder` → state update
6. **Parse ações** → Extrai `<!--action:{...}-->` tags → renderiza como botões de navegação
7. **Persist** → `sessionStorage` salva histórico (limpa ao fechar aba)

---

## 🛠️ Tech Stack

| Camada | Tecnologia | Propósito |
|--------|-----------|-----------|
| **LLM** | Claude Haiku 4.5 | Geração de respostas (300 tokens max, temp 1) |
| **SDK** | @anthropic-ai/sdk | Cliente oficial da Anthropic com streaming |
| **Rate Limit** | Upstash Redis + @upstash/ratelimit | 3 camadas serverless (burst/hourly/daily) |
| **API** | Next.js Route Handler | POST endpoint com streaming via ReadableStream |
| **Frontend** | React 18+ | Componentes client-side com hooks |
| **Animações** | Framer Motion | Spring animations, AnimatePresence, reduced motion |
| **i18n** | next-intl | Bilíngue (pt/en) com detecção automática |
| **State** | Custom hook (useChat) | Session storage, abort control, debounce |

---

## 📁 Estrutura do Projeto

```
src/
├── api/chat/
│   └── route.ts              # API Route — validation, rate limit, Claude streaming
├── components/
│   ├── chat-widget.tsx        # Orchestrator — scroll detection, navigation actions, Lenis
│   ├── chat-widget-loader.tsx # Dynamic import wrapper (SSR = false)
│   ├── chat-window.tsx        # UI — messages, typing indicator, action buttons, input
│   └── chat-bubble.tsx        # FAB — avatar, notification badge, spring animation
├── hooks/
│   └── use-chat.ts            # State — messages, streaming, session storage, debounce
├── lib/
│   ├── melisso-context.ts     # System prompt + persona + professional context JSON
│   └── rate-limit.ts          # 3-layer Upstash Redis rate limiter
├── types/
│   └── index.ts               # ChatAction, ChatMessage, ChatApiRequest
└── messages/
    ├── pt.json                # Traduções português
    └── en.json                # Traduções inglês

assets/
└── melisso-avatar.jpeg        # Avatar do Melisso

docs/
├── architecture.md            # Detalhes de arquitetura
└── methodology.md             # Metodologia e boas práticas
```

---

## 🔒 Rate Limiting — 3 Camadas

O sistema usa **sliding window** (janela deslizante) com Upstash Redis serverless:

| Camada | Limite | Janela | Propósito |
|--------|--------|--------|-----------|
| **Burst** | 5 msgs | 10 segundos | Bloqueia spam rápido e curl loops |
| **Hourly** | 20 msgs | 1 hora | Generoso para um recrutador real navegando |
| **Daily** | 50 msgs | 24 horas | Protege o budget mensal de tokens |

As 3 camadas são checadas **em paralelo** (`Promise.all`) — a primeira que falhar retorna `429 Too Many Requests` com header `Retry-After`.

```typescript
// Todas as camadas checadas simultaneamente
const [burst, hourly, daily] = await Promise.all([
  burstLimiter.limit(ip),
  hourlyLimiter.limit(ip),
  dailyLimiter.limit(ip),
]);
```

---

## 🛡️ Segurança

| Medida | Implementação |
|--------|--------------|
| **Input Sanitization** | HTML stripping via regex antes de enviar ao LLM |
| **Length Caps** | Max 500 chars/msg, max 30 msgs/sessão |
| **Sliding Window** | Apenas últimas 10 msgs enviadas ao LLM (economia de tokens) |
| **Abort Controller** | Cancela stream anterior se usuário enviar nova msg |
| **Rate Limiting** | 3 camadas serverless (burst + hourly + daily) |
| **IP Detection** | Via `x-forwarded-for` header (Vercel/proxy) |
| **Type Validation** | Validação rigorosa de request body antes de processar |
| **No Secrets Leaked** | API key apenas server-side, nunca exposta ao client |

---

## 🤖 System Prompt Engineering

O Melisso usa um **system prompt estruturado** com:

1. **Persona definida**: Gato real de 4 anos, simpático e profissional
2. **Contexto JSON**: Dados profissionais do Victor (skills, projetos, experiência)
3. **Instruções de navegação**: Tags `<!--action:{...}-->` que o frontend parseia em botões
4. **Guardrails**: Limites de escopo, redirecionamento gentil, honestidade

```
System Prompt (~800 tokens)
├── Persona (quem é o Melisso, origem do nome)
├── Personalidade (conciso, 2-4 frases, emoji moderado)
├── VICTOR_CONTEXT (JSON com dados profissionais)
├── Navegação (formato de action tags)
└── Regras (escopo, limites, comportamento)
```

---

## ⚡ Performance

- **Lazy Loading**: Widget carregado via `dynamic()` com `ssr: false` — zero impacto no LCP
- **Sliding Window**: Apenas últimas 10 mensagens enviadas ao LLM (reduz latência e tokens)
- **Streaming**: Respostas aparecem em tempo real, sem esperar processamento completo
- **Debounce**: 1 segundo entre envios (previne double-sends e spam)
- **Abort Controller**: Cancela requests pendentes quando novo envio acontece
- **Session Storage**: Persistência local sem round-trips ao servidor

---

## 🚀 Setup & Integração

### Variáveis de Ambiente

```bash
cp .env.example .env.local
```

| Variável | Obrigatória | Descrição |
|----------|------------|-----------|
| `ANTHROPIC_API_KEY` | ✅ | Chave da API Anthropic (Claude) |
| `UPSTASH_REDIS_REST_URL` | ✅ | URL do Redis Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Token de autenticação Upstash |

### Pré-requisitos

- Node.js >= 18
- Next.js >= 14 (App Router)
- Conta na [Anthropic](https://console.anthropic.com/) (API key)
- Conta no [Upstash](https://upstash.com/) (Redis database)

### Integração no seu projeto

1. Copie a pasta `src/` para o seu projeto Next.js
2. Ajuste os imports (`@/lib/utils`, `@/lib/constants`) para seu projeto
3. Adicione `<ChatWidgetLoader />` no seu layout
4. Configure as variáveis de ambiente
5. Customize o `melisso-context.ts` com seus dados profissionais

---

## 🎨 Customização

### Trocar a persona

Edite `src/lib/melisso-context.ts`:
- Altere `VICTOR_CONTEXT` com seus dados profissionais
- Modifique o `MELISSO_SYSTEM_PROMPT` para sua persona
- Ajuste as seções de navegação válidas

### Ajustar rate limits

Edite `src/lib/rate-limit.ts`:
- `burstLimiter`: Proteção contra spam rápido
- `hourlyLimiter`: Uso normal por sessão
- `dailyLimiter`: Cap diário por IP

### Alterar modelo LLM

Em `src/api/chat/route.ts`:
- `model`: Troque para outro modelo Claude (ou adapte para OpenAI)
- `max_tokens`: Ajuste o tamanho máximo de resposta
- `temperature`: Controle a criatividade (0-1)

---

## 📊 Métricas de Design

| Métrica | Valor |
|---------|-------|
| Componentes React | 4 (bubble, window, widget, loader) |
| Hooks customizados | 1 (useChat) |
| Linhas de código | ~900 |
| Tamanho do bundle (tree-shaken) | ~12KB gzipped (sem deps) |
| Latência média de resposta | < 500ms (TTFB streaming) |
| System prompt | ~800 tokens |
| Max tokens por resposta | 300 |

---

## 📄 Licença

MIT © [Victor Campos](https://github.com/euvhmac)

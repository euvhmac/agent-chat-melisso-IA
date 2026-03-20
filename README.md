# Melisso — A Camada de IA do Meu Portfólio

**Um agente conversacional com streaming em tempo real, arquitetura serverless e alma de gato.**

[![Live Demo](https://img.shields.io/badge/demo-vhmac.com-blue?style=for-the-badge)](https://vhmac.com)
[![Claude Haiku 4.5](https://img.shields.io/badge/LLM-Claude_Haiku_4.5-orange?style=flat-square)](https://anthropic.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

---

## A história por trás do nome

<img src="assets/melisso-avatar.jpeg" alt="Melisso — o gato real" width="220" align="right" style="margin-left: 16px; border-radius: 12px;" />

O Melisso existe na vida real. É o meu gato.

Quando eu o adotei, achava que era fêmea — o nome era Melissa. Quando descobri que era macho, virou **Melisso**. Ele tá sempre ali do lado enquanto eu trabalho, então nada mais justo do que colocar o nome dele no projeto.

Mas além da homenagem, o nome carrega intenção: **um portfólio não precisa ser uma landing page estática e impessoal.** O Melisso é a camada de IA que traz dinamismo, inteligência e personalidade para a experiência — transforma visitantes passivos em conversas reais.

> **[Veja o Melisso em ação →](https://vhmac.com)**

---

## O que o Melisso resolve

Se você está aqui, provavelmente veio do meu [LinkedIn](https://linkedin.com/in/vhmac), do meu [portfólio](https://vhmac.com), ou de ambos. Este repositório mostra **como** eu penso engenharia — não apenas o resultado final.

O Melisso é um agente de chat com IA embarcado no portfólio que:

- **Tira dúvidas sobre mim** — projetos, stack, experiência, certificações
- **Guia a navegação** — sugere seções e filtra projetos via botões de ação
- **Atende recrutadores e interessados** — respostas rápidas, contextuais e bilíngues (pt/en)
- **Humaniza a experiência** — streaming em tempo real com persona de gato, nunca um chatbot genérico

**A questão técnica que vale a pena observar aqui:** não é só um wrapper de API. É um sistema com streaming nativo, rate limiting em 3 camadas, sanitização de input, prompt engineering estruturado e zero dependências desnecessárias.

<div align="center">
<img src="assets/chat.png" alt="Melisso Chat — Boas-vindas" width="380" style="border-radius: 12px; margin-top: 16px;" />
<br />
<em>Print real do chat com a mensagem de boas-vindas e prompts sugeridos</em>
</div>

---

## Arquitetura

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

### Fluxo completo de uma mensagem

```
Usuário digita → debounce (1s) → sanitize + validate → rate limit check (3 camadas)
→ sliding window (últimas 10 msgs) → Claude Haiku 4.5 → ReadableStream
→ chunks renderizados em tempo real → parse de action tags → botões de navegação
→ sessionStorage persist
```

Cada etapa existe por uma razão. Nenhuma foi adicionada "porque sim". Abaixo, explico as decisões.

---

## Decisões técnicas e os porquês

> Este é o core do repositório. Se você é tech lead, recrutador técnico ou engenheiro, esta seção é para você.

### Por que streaming nativo em vez de AI SDK?

```typescript
// ReadableStream puro — sem abstrações, sem SDKs de streaming
const readableStream = new ReadableStream({
  async start(controller) {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        controller.enqueue(encoder.encode(event.delta.text));
      }
    }
    controller.close();
  },
});
```

O Vercel AI SDK é excelente, mas adiciona **~15KB ao bundle** e abstrai o controle do stream. Aqui, eu preciso de controle total: parsing de action tags inline, abort em qualquer ponto, e zero bytes a mais no bundle do cliente. `ReadableStream` nativo resolve isso com **zero dependências extras**.

### Por que 3 camadas de rate limiting?

Uma camada só não dá conta. Um recrutador real navegando por 20 minutos precisa de espaço. Um bot fazendo curl loop precisa ser bloqueado em segundos. A solução:

| Camada | Limite | Janela | Raciocínio |
|--------|--------|--------|------------|
| **Burst** | 5 msgs | 10s | Mata bots e spam automatizado imediatamente |
| **Hourly** | 20 msgs | 1h | Generoso para uso humano real — um recrutador navega tranquilo |
| **Daily** | 50 msgs | 24h | Proteção de budget — Claude tem custo por token |

As 3 camadas rodam **em paralelo** (`Promise.all`) — a mais restritiva que falhar retorna `429` com `Retry-After` header. Algoritmo: **sliding window** (mais preciso que fixed window, sem bursts nas fronteiras).

```typescript
const [burst, hourly, daily] = await Promise.all([
  burstLimiter.limit(ip),
  hourlyLimiter.limit(ip),
  dailyLimiter.limit(ip),
]);
```

### Por que sessionStorage em vez de banco de dados?

**Privacy first.** O chat é descartável por design — não preciso (e não quero) persistir conversas de visitantes. `sessionStorage` limpa automaticamente ao fechar a aba. Sem cookies, sem tracking, sem round-trips ao servidor para carregar histórico.

### Por que Claude Haiku 4.5?

Testei GPT-4o-mini e Claude Haiku lado a lado. Para respostas curtas (2-4 frases), concisas e com persona, o Haiku ganhou em **custo-benefício e naturalidade**. Com `temperature: 1` e `max_tokens: 300`, as respostas soam humanas sem divagar.

### Por que action tags no texto em vez de structured output?

```
<!--action:{"type":"navigate","target":"#projects","filter":"ai","label":"Ver projetos de IA"}-->
```

Structured output (tool use / function calling) exige que o modelo termine de pensar antes de retornar a estrutura. Com action tags **inline no texto**, o streaming funciona normalmente — o frontend parseia as tags no final, extraindo botões de navegação sem interromper o fluxo. Simples, eficiente, zero latência adicional.

---

## Stack técnica

| Camada | Tecnologia | Por que essa escolha |
|--------|-----------|----------------------|
| **LLM** | Claude Haiku 4.5 | Melhor custo/qualidade para respostas curtas com persona |
| **SDK** | @anthropic-ai/sdk | Cliente oficial com suporte nativo a streaming |
| **Rate Limit** | Upstash Redis | Serverless, sliding window, funciona nativamente na Vercel |
| **API** | Next.js Route Handler | Streaming via ReadableStream, sem serverless cold start |
| **Frontend** | React 18+ | Client components com hooks customizados |
| **Animações** | Framer Motion | Spring physics, `AnimatePresence`, respeita `prefers-reduced-motion` |
| **i18n** | next-intl | Detecção automática de idioma, fallback configurável |
| **State** | useChat (custom hook) | Session persistence, abort control, debounce, action parsing |

---

## Segurança — não foi adicionada depois, foi premissa

| Vetor | Proteção | Implementação |
|-------|----------|---------------|
| **Injection (XSS)** | HTML stripping | Regex remove tags antes de enviar ao LLM |
| **Spam / DDoS** | Rate limiting 3 camadas | Burst + hourly + daily via Upstash Redis |
| **API key exposure** | Server-side only | Chave nunca trafega para o client |
| **Payload abuse** | Validação rigorosa | Max 500 chars/msg, max 30 msgs/sessão, type checking |
| **Token drain** | Sliding window | Apenas últimas 10 msgs enviadas ao LLM |
| **Race conditions** | AbortController | Cancela stream anterior a cada novo envio |
| **Memory leak** | Auto-cleanup | Timers, observers e controllers são limpos no unmount |
| **IP spoofing** | Header extraction | `x-forwarded-for` com fallback para Vercel/proxy |

---

## Prompt Engineering

O system prompt não é um texto jogado — é uma **arquitetura de contexto** com ~800 tokens:

```
System Prompt
├── Persona → Quem é o Melisso (gato real, 4 anos, história do nome)
├── Personalidade → 2-4 frases, emoji moderado, honesto, conciso
├── VICTOR_CONTEXT → JSON estruturado (skills, projetos, experiência, contato)
├── Navegação → Formato de action tags para botões clicáveis
└── Guardrails → Escopo definido, redirecionamento gentil, zero invenção
```

O contexto profissional é injetado como **JSON raw** — não texto livre. Isso dá ao modelo dados estruturados para consultar, reduz alucinação e mantém o prompt enxuto.

---

## Estrutura do projeto

```
src/
├── api/chat/
│   └── route.ts              # Pipeline: validate → rate limit → stream → respond
├── components/
│   ├── chat-widget.tsx        # Orchestrator: scroll detection, navigation, Lenis
│   ├── chat-widget-loader.tsx # Entry point: dynamic import, SSR = false
│   ├── chat-window.tsx        # UI: messages, typing indicator, actions, input
│   └── chat-bubble.tsx        # FAB: avatar, notification badge, spring animation
├── hooks/
│   └── use-chat.ts            # Core: state, streaming, session, debounce, abort
├── lib/
│   ├── melisso-context.ts     # Prompt engineering: persona + contexto profissional
│   └── rate-limit.ts          # 3-layer rate limiter com Upstash Redis
├── types/
│   └── index.ts               # Contratos: ChatAction, ChatMessage, ChatApiRequest
└── messages/
    ├── pt.json                # i18n: Português
    └── en.json                # i18n: English
```

**Princípio:** cada arquivo tem uma responsabilidade. Nenhum ultrapassa 150 linhas. Sem god classes, sem acoplamento silencioso.

---

## Performance

| Otimização | Como | Impacto |
|------------|------|---------|
| **Lazy loading** | `dynamic()` com `ssr: false` | Zero impacto no LCP — o widget não existe no bundle do servidor |
| **Streaming** | `ReadableStream` nativo | TTFB < 500ms — usuário vê a resposta sendo "digitada" |
| **Sliding window** | Últimas 10 msgs ao LLM | Reduz latência e custo de input tokens |
| **Debounce** | 1s entre envios | Previne double-sends e spam acidental |
| **AbortController** | Cancela stream pendente | Sem race conditions, sem respostas fantasma |
| **Session storage** | Persistência local | Zero round-trips ao servidor para carregar histórico |
| **useCallback** | Memoização de handlers | Re-renders eficientes em toda a árvore |

---

## Acessibilidade

Não é feature — é requisito:

- `role="dialog"` + `aria-label` no chat window
- `role="log"` + `aria-live="polite"` no container de mensagens
- `aria-label` em todos os botões de ação
- `prefers-reduced-motion` respeitado em todas as animações
- Teclado: `Enter` envia, `Shift+Enter` quebra linha, `Esc` fecha

---

## Métricas

| Métrica | Valor |
|---------|-------|
| Componentes React | 4 |
| Custom hooks | 1 |
| Linhas de código | ~900 |
| Bundle size (gzipped, sem deps) | ~12KB |
| TTFB médio (streaming) | < 500ms |
| System prompt | ~800 tokens |
| Max tokens/resposta | 300 |
| Zero `any` no codebase | ✅ |

---

## Setup

### Pré-requisitos

- Node.js >= 18
- Next.js >= 14 (App Router)
- [Anthropic API Key](https://console.anthropic.com/)
- [Upstash Redis](https://upstash.com/)

### Variáveis de ambiente

```bash
cp .env.example .env.local
```

| Variável | Descrição |
|----------|-----------|
| `ANTHROPIC_API_KEY` | Chave da API Anthropic (Claude) |
| `UPSTASH_REDIS_REST_URL` | URL do Redis serverless |
| `UPSTASH_REDIS_REST_TOKEN` | Token de autenticação Upstash |

### Integração

```tsx
// No layout principal do seu Next.js App Router
import { ChatWidgetLoader } from "@/components/chat-widget-loader";

export default function Layout({ children }) {
  return (
    <>
      {children}
      <ChatWidgetLoader />
    </>
  );
}
```

Customize a persona em `src/lib/melisso-context.ts` e os rate limits em `src/lib/rate-limit.ts`.

---

## Documentação técnica adicional

Para quem quer ir mais fundo:

- **[`docs/architecture.md`](docs/architecture.md)** — Detalhamento camada por camada, diagramas e design decisions completas
- **[`docs/methodology.md`](docs/methodology.md)** — Princípios de desenvolvimento, boas práticas e stack decisions log

---

## Licença

MIT © [Victor Campos](https://github.com/euvhmac)

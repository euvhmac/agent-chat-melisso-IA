# Metodologia — Melisso Chat Agent

## Princípios de Desenvolvimento

### 1. Streaming-First

Toda a arquitetura foi desenhada em torno de streaming em tempo real:
- A API retorna um `ReadableStream` — não um JSON com a resposta completa
- O hook `useChat` consome chunks incrementais via `reader.read()`
- O state atualiza a cada chunk, não ao final da resposta
- O `AbortController` permite cancelar streams a qualquer momento

**Impacto:** TTFB (Time to First Byte) < 500ms — o usuário vê a resposta sendo "digitada" imediatamente.

### 2. Security by Design

Segurança não foi adicionada depois — foi premissa desde o dia 1:

- **Input**: HTML stripping, length caps, format validation
- **Transport**: API Route server-side (API key nunca exposta)
- **Rate Limit**: 3 camadas independentes com sliding window
- **Session**: sessionStorage (sem persistência permanente)
- **Concorrência**: AbortController previne race conditions

### 3. UX-Driven Engineering

Decisões técnicas guiadas pela experiência do usuário:

| Feature UX | Solução Técnica |
|-----------|----------------|
| "Digitando..." em tempo real | ReadableStream + incremental state |
| Chat não atrapalha primeira visita | IntersectionObserver no Hero |
| Lembra contexto na mesma sessão | sessionStorage com serialização |
| Botões de ação nas respostas | Action tags parseadas do LLM |
| Não bloqueia navegação | AbortController em nova mensagem |
| Prompts sugeridos | Presets i18n renderizados no mount |

### 4. Cost-Aware Design

Claude Haiku 4.5 foi escolhido pelo melhor custo-benefício:

- **Sliding window de 10 msgs**: Evita enviar histórico completo (economia de input tokens)
- **Max 300 tokens/resposta**: Respostas concisas, diretas ao ponto
- **3 camadas de rate limit**: Protege budget mensal de forma granular
- **Temperature 1**: Respostas naturais sem repetição excessiva

### 5. Separation of Concerns

Cada arquivo tem **uma responsabilidade clara**:

```
Rendering    → ChatBubble, ChatWindow (puro visual)
Orchestration → ChatWidget (lógica de negócio do widget)
State        → useChat (estado, streaming, persistence)
API          → route.ts (validation, rate limit, LLM proxy)
Security     → rate-limit.ts (rate limiting serverless)
Context      → melisso-context.ts (prompt engineering)
Types        → types/index.ts (contratos de dados)
```

Nenhum componente faz mais de uma coisa. Nenhum arquivo ultrapassa 150 linhas.

## Boas Práticas Implementadas

### TypeScript Strict

- Zero `any` em todo o codebase
- Interfaces explícitas para props, returns e API contracts
- Type guards na validação de request

### Acessibilidade

- `role="dialog"` e `aria-label` no ChatWindow
- `role="log"` e `aria-live="polite"` no container de mensagens
- `aria-label` em todos os botões de ação
- `prefers-reduced-motion` respeitado em todas as animações
- Keyboard: `Enter` envia, `Shift+Enter` quebra linha, `Esc` fecha

### Performance

- **Lazy loading**: Widget carregado via `dynamic()` com `ssr: false`
- **No SSR impact**: Zero código do chat no bundle do servidor
- **Efficient re-renders**: `useCallback` em todos os handlers
- **Auto-cleanup**: AbortController, timers, IntersectionObserver

### Error Handling

- API retorna status codes semânticos (400, 429, 500, 503)
- Rate limit retorna `Retry-After` header
- Stream errors são capturados e exibidos como mensagem amigável
- AbortError é silenciado (cancelamento intencional)
- sessionStorage errors são silenciados (storage full)

## Stack Decisions Log

| Decisão | Data | Contexto |
|---------|------|----------|
| Claude Haiku 4.5 over GPT-4o-mini | Sprint 7 | Melhor custo/qualidade para respostas curtas |
| Upstash Redis over in-memory | Sprint 9 | Funciona em serverless (Vercel), zero infra |
| Custom streaming over AI SDK | Sprint 7 | Controle total, zero deps extras, mais leve |
| sessionStorage over DB | Sprint 7 | Sem necessidade de persistir — privacy first |
| Action tags over tools/functions | Sprint 7 | Funciona com streaming, simples de parsear |
| 3-layer rate limit | Sprint 9 | Granular: burst ≠ hourly ≠ daily |
| Persona "gato" | Sprint 7 | Memorável, diferenciado, humaniza o portfólio |

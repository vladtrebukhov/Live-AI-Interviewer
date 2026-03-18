# Backend Architecture Research — live-interview

## Research Topics

- HTTP framework and patterns used
- API routes and their purposes
- WebSocket message protocol and flow
- LLM integration approach (streaming, models, prompts)
- TTS integration approach
- Database schema, access patterns, and ORM usage
- Authentication/authorization approach
- Error handling patterns
- Testing patterns and mocking strategies
- Environment configuration and dependency management

---

## 1. HTTP Framework and Server Architecture

### Framework: Fastify v5

The backend uses **Fastify v5** (`fastify@^5.2.1`), not Hono or Express.

**Entry point:** `packages/backend/src/server.ts`

- `buildApp()` creates and configures the Fastify instance with `{ logger: true }` (Pino-based structured logging).
- CORS is configured via `@fastify/cors` with `origin` locked to `FRONTEND_URL` env var (defaults to `http://localhost:3000`).
- Route plugins registered with prefixes:
  - `questionRoutes` → `/api/questions`
  - `sessionRoutes` → `/api/sessions`
  - `speechRoutes` → `/api/speech`
  - `wsRoutes` → registers its own `/api/ws` path
- Health check: `GET /health` returns `{ status: 'ok', timestamp: ISO }`.
- `start()` binds to `HOST:PORT` (defaults `0.0.0.0:3001`).
- Test guard: `start()` only executes when `NODE_ENV !== 'test'`; `buildApp` is exported for test injection.

### Plugin Registration Pattern

All route modules export an `async function xxxRoutes(app: FastifyInstance): Promise<void>` and are registered via `app.register(plugin, { prefix })`. This is idiomatic Fastify encapsulation.

---

## 2. API Routes

### 2.1 Questions API — `packages/backend/src/routes/questions.ts`

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/questions` | List all questions with visible (non-hidden) test cases and starter codes, ordered by `createdAt` desc |
| `GET` | `/api/questions/:id` | Get a single question with visible test cases and starter codes; returns 404 if not found |

- Uses Prisma `findMany`/`findUnique` with `include` for related `testCases` (filtered `isHidden: false`) and `starterCodes`.
- No authentication or authorization checks.
- No pagination.

### 2.2 Sessions API — `packages/backend/src/routes/sessions.ts`

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/sessions` | Create a new interview session for a given `questionId` |
| `GET` | `/api/sessions` | List sessions, optionally filtered by `?status=active\|completed\|abandoned` |
| `GET` | `/api/sessions/:id` | Get session by ID with associated question and messages (ordered by `createdAt` asc) |
| `PATCH` | `/api/sessions/:id` | Update session code and/or status (completed/abandoned); sets `endedAt` on status transitions |

Key behaviors:

- `POST` validates `questionId` exists, looks up TypeScript starter code as default, creates session with `code: defaultCode`.
- `PATCH` validates code size (`< 100,000` chars) and status enum.
- No authentication — sessions are freely created and modified.

### 2.3 Speech API — `packages/backend/src/routes/speech.ts`

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/speech/token` | Issue an Azure Cognitive Services Speech token to the browser |

Security controls:

- **Origin validation**: Compares request `Origin` (or `Referer`) header against `FRONTEND_URL`. Returns 403 on mismatch.
- **Rate limiting**: In-memory sliding-window rate limiter per IP — max 10 requests per 60 seconds. Returns 429 when exceeded.
- **Scope validation**: Requires `questionId` or `sessionId` in body; verifies the referenced entity exists in the database. Cross-validates that a provided `sessionId` belongs to the given `questionId`.
- **Endpoint filtering**: `getBrowserSpeechEndpoint()` strips regional Cognitive Services endpoints (`*.api.cognitive.microsoft.com`) to prevent exposing them as browser recognition endpoints; only explicit Speech-service paths (`/speech/`) are passed through.

Response headers: `Cache-Control: no-store`, `Vary: Origin`.

Response payload: `{ token, region, endpoint?, expiresInSeconds: 600 }`.

Error codes: 400 (missing scope / mismatch), 403 (origin), 404 (scope not found), 429 (rate limit), 502 (upstream failure), 503 (not configured).

---

## 3. WebSocket Protocol — `packages/backend/src/routes/ws.ts`

### Connection

- Endpoint: `GET /api/ws?questionId=X&sessionId=Y`
- Uses `@fastify/websocket` (wraps `ws` library).
- On connect:
  1. Validates `questionId` query param (closes socket if missing).
  2. Loads question from DB (closes if not found).
  3. Calls `hydrateWsConnection()` to restore session state (code, conversation history) if `sessionId` is provided.
  4. Logs connection.

### Connection State (`WsConnectionState`)

```typescript
interface WsConnectionState {
  boundSessionId: string | null;
  currentCode: string;
  conversationHistory: ConversationMessage[];
}
```

State is held **in-memory per connection**, not in a shared store. Reconnection with a `sessionId` rehydrates from the database.

### Incoming Messages (`WsIncoming`)

| Type | Fields | Purpose |
|------|--------|---------|
| `code_update` | `code`, `sessionId?` | Sync editor code to server; persists to DB if session bound |
| `transcript_final` | `text`, `sessionId?`, `code?`, `timing?` | Final speech transcript; persists code + message in a DB transaction; echoes back as `transcript` |
| `speech_status` | `status`, `error?`, `sessionId?` | Client speech status update (idle/starting/listening/stopping/error); debug-logged only |
| `request_feedback` | `includeTts?`, `sessionId?` | Request AI interviewer feedback; triggers LLM call and optionally TTS |

### Outgoing Messages (`WsOutgoing`)

| Type | Fields | Purpose |
|------|--------|---------|
| `transcript` | `text`, `sessionId?`, `timing?` | Echoed finalized transcript |
| `feedback` | `content`, `feedbackType`, `sessionId?` | AI feedback response |
| `error` | `message` | Error notification |
| `audio` | `audio` (base64) | TTS audio buffer as base64 opus |

### Session ID Mismatch Guard

All message handlers that accept `sessionId` verify it matches the `boundSessionId`. Mismatch returns an `error` message. This prevents cross-session data leaks.

### Message Flow: `request_feedback`

1. Snapshot conversation history.
2. Call `generateFeedback()` with question context, current code, last user message, and conversation history.
3. Push assistant response to in-memory conversation history.
4. Persist as `SessionMessage` (role: assistant, messageType: feedback) if session is bound.
5. Send `feedback` message to client.
6. If `includeTts`, call `synthesizeSpeech()` and send `audio` message (base64-encoded opus).

### Architecture: Dependency Injection for Testability

`handleWsIncomingMessage` and `hydrateWsConnection` are **extracted as pure async functions** that accept a `dependencies` object:

```typescript
interface WsMessageHandlerDependencies {
  prismaClient?: WsMessagePrismaClient;
  feedbackGenerator?: typeof generateFeedback;
  speechSynthesizer?: typeof synthesizeSpeech;
  logger?: Pick<FastifyInstance['log'], 'error' | 'debug'>;
  sendMessage?: (msg: WsOutgoing) => void;
}
```

This allows full unit testing without a live WebSocket connection. The route handler in `wsRoutes()` wires real dependencies. Tests inject mocks via the `dependencies` parameter.

The interfaces for Prisma clients (`WsHydrationPrismaClient`, `WsMessagePrismaClient`) are **hand-written interface subsets** — not the full Prisma client type — enabling lightweight mock creation.

---

## 4. LLM Integration — `packages/backend/src/services/llm.ts`

### SDK and Provider

- Uses **Azure OpenAI** via the `openai` npm package (`AzureOpenAI` class).
- Env vars: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_API_VERSION` (default `2024-12-01-preview`).
- Deployment: `AZURE_OPENAI_LLM_DEPLOYMENT` (default `gpt-4o`).

### Not Streaming

The API uses `openai.chat.completions.create()` **without streaming** (`stream: false` implicit). The full response is awaited and returned at once.

### Prompt Design

**System prompt** establishes the AI as a technical interviewer for low-level design (LLD) coding interviews. Behavioral rules:

1. Guide without giving direct answers.
2. Ask clarifying questions about approach.
3. Point out potential issues.
4. Confirm good decisions.
5. Provide hints when stuck.
6. Evaluate communication and thought process.

Conciseness constraint: "2-3 sentences unless more detail is needed."

**Structured output**: Requests JSON response format (`response_format: { type: 'json_object' }`) with schema `{ content: string, type: "clarification"|"hint"|"feedback"|"confirmation"|"follow-up" }`.

### Conversation Window

- Includes last 20 messages from conversation history (`.slice(-20)`).
- System messages from history are mapped to `user` role (avoids OpenAI restrictions on multiple system messages).
- Context message appends current code (in a fenced block) and the most recent user transcript.

### Parameters

- `temperature: 0.7`
- `max_tokens: 500`

### Error Handling

- JSON parse failure: falls back to raw text with type `'feedback'`.
- Empty/missing content: returns `'Could not generate feedback.'`.

---

## 5. TTS Integration — `packages/backend/src/services/tts.ts`

### SDK and Provider

- Uses **Azure OpenAI TTS** via the `openai` npm package (`AzureOpenAI` class).
- Supports separate TTS-specific endpoint/key/version env vars (`AZURE_OPENAI_TTS_ENDPOINT`, `AZURE_OPENAI_TTS_API_KEY`, `AZURE_OPENAI_TTS_API_VERSION`), falling back to the main OpenAI vars.

### API

```typescript
synthesizeSpeech(text: string): Promise<Buffer>
```

- Model: `AZURE_OPENAI_TTS_DEPLOYMENT` (default `'tts'`).
- Voice: `'alloy'` (hardcoded).
- Format: `'opus'` (efficient for web streaming).
- Returns a Node.js `Buffer` containing the audio.

### Dual-Path Speech Architecture

The project has two speech paths:

1. **Speech Recognition (STT)**: Client-side via Azure Cognitive Services Speech SDK, using tokens issued by `POST /api/speech/token`.
2. **Text-to-Speech (TTS)**: Server-side via Azure OpenAI TTS API in `services/tts.ts`, audio sent over WebSocket as base64-encoded opus.

---

## 6. Database Layer

### ORM: Prisma v7 with PostgreSQL

- `@prisma/client@^7.4.2` with `@prisma/adapter-pg` (driver adapter for native `pg`).
- Generated client output: `packages/backend/src/generated/prisma/`.
- Prisma config: `packages/backend/prisma.config.ts` using `defineConfig` with `loadBackendEnv()`.

### Schema: `packages/backend/prisma/schema.prisma`

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `Question` | id (cuid), title, description (Text), difficulty (enum), tags (String[]) | Has many TestCase, StarterCode, InterviewSession |
| `StarterCode` | id, questionId, language, code (Text) | Unique on `[questionId, language]` |
| `TestCase` | id, questionId, input (Text), expectedOutput (Text), isHidden | Hidden test cases for grading |
| `InterviewSession` | id, questionId, code (Text, default ""), status (enum), startedAt, endedAt? | Session lifecycle tracking |
| `SessionMessage` | id, sessionId, role (enum), content (Text), messageType (enum), createdAt | Chat/transcript history |

Enums: `Difficulty` (easy/medium/hard), `SessionStatus` (active/completed/abandoned), `MessageRole` (user/assistant/system), `MessageType` (code/speech/feedback/system).

Cascade deletes: TestCase, StarterCode, SessionMessage cascade on parent deletion.

### Prisma Client Singleton — `packages/backend/src/lib/prisma.ts`

- Calls `loadBackendEnv()` at module scope to ensure `DATABASE_URL` is available.
- Validates `DATABASE_URL` is a non-empty string (`getDatabaseUrl()`).
- Uses global caching pattern (`globalForPrisma`) to reuse the client in non-production environments (avoids connection pool exhaustion during hot reload).
- Initializes with `PrismaPg` adapter: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`.

### Database Access Patterns

- **Direct Prisma calls** in route handlers (no repository/service layer abstraction).
- `include` for eager loading relations.
- `$transaction` for atomic multi-operation writes (e.g., code update + message creation in WS handler).
- Filtering with `where` clauses (e.g., `isHidden: false`, `status` enum).

### Seed Data — `packages/backend/prisma/seed.ts`

Seeds 7 interview questions with:

- Parking Lot (medium), LRU Cache (medium), Task Scheduler (hard), URL Shortener (easy), Elevator System (hard), Rate Limiter (medium), File System (medium).
- Each has TypeScript and JavaScript starter codes.
- Each has visible and hidden test cases.
- Seed uses `deleteMany` cascade to wipe before inserting (idempotent).

---

## 7. Authentication and Authorization

**There is no authentication or authorization.**

- No user model (migration `20260307000000_drop_user_model` removed it).
- No Clerk, JWT, session cookies, or API keys on routes.
- Sessions are anonymous (no user association).
- Speech token endpoint has origin validation and rate limiting but no auth.
- WebSocket connections are unauthenticated.

This is an intentional design — the app appears to be a solo/demo interview tool without multi-user requirements.

---

## 8. Error Handling Patterns

### HTTP Routes

- **Validation errors**: Manual checks returning `reply.code(400).send({ error: '...' })`.
- **Not found**: `reply.code(404).send({ error: '...' })`.
- **Unhandled errors**: Delegated to Fastify's default error handler (logs via Pino, returns 500).
- **Upstream failures**: Speech token upstream errors return 502 with structured logging.
- **Service unavailable**: Missing Azure config returns 503.

### WebSocket

- Invalid JSON parse → sends `{ type: 'error', message: 'Invalid JSON' }`.
- Missing required fields → sends type-specific error (e.g., `'code field required for code_update'`).
- Session ID mismatch → sends `'sessionId mismatch for {type}'`.
- LLM/TTS failures → caught with try/catch, logged, sends `{ type: 'error', message: 'Failed to generate feedback' }`.
- TTS failure during feedback does **not** fail the feedback response — it's caught separately and only logged.

### Service Layer

- LLM: JSON parse failure gracefully falls back to raw text.
- TTS: No explicit error handling (errors propagate to caller).

---

## 9. Environment Configuration — `packages/backend/src/lib/env.ts`

### `loadBackendEnv()`

1. Loads workspace root `.env` first.
2. Loads package-level `packages/backend/.env` second with `override: true` (package env takes precedence).
3. Uses `import.meta.url` to resolve paths relative to the module.

### Required Env Vars

| Variable | Used By | Required |
|----------|---------|----------|
| `DATABASE_URL` | Prisma | Yes (throws if missing) |
| `AZURE_OPENAI_ENDPOINT` | LLM, TTS | Yes for AI features |
| `AZURE_OPENAI_API_KEY` | LLM, TTS | Yes for AI features |
| `AZURE_OPENAI_API_VERSION` | LLM, TTS | No (default: `2024-12-01-preview`) |
| `AZURE_OPENAI_LLM_DEPLOYMENT` | LLM | No (default: `gpt-4o`) |
| `AZURE_OPENAI_TTS_ENDPOINT` | TTS | No (falls back to main endpoint) |
| `AZURE_OPENAI_TTS_API_KEY` | TTS | No (falls back to main key) |
| `AZURE_OPENAI_TTS_API_VERSION` | TTS | No (falls back to main version) |
| `AZURE_OPENAI_TTS_DEPLOYMENT` | TTS | No (default: `tts`) |
| `AZURE_SPEECH_KEY` | Speech token | Yes for STT features |
| `AZURE_SPEECH_REGION` | Speech token | Yes for STT features |
| `AZURE_SPEECH_ENDPOINT` | Speech token | No (optional custom endpoint) |
| `FRONTEND_URL` | CORS, Speech origin | No (default: `http://localhost:3000`) |
| `PORT` | Server | No (default: `3001`) |
| `HOST` | Server | No (default: `0.0.0.0`) |

### Module-Scope Loading Pattern

Both `llm.ts` and `tts.ts` call `loadBackendEnv()` at module scope before constructing `AzureOpenAI` instances. This addresses the ESM import order issue (env must be loaded before SDK clients read env vars). `prisma.ts` does the same.

---

## 10. Testing Patterns

### Framework: Vitest

- Config: Root `vitest.config.ts` includes `packages/*/src/**/*.test.ts`.
- Tests live in `__tests__/` directories adjacent to source.

### Mocking Strategy

#### Module-Level Mocks via `vi.mock()`

All tests mock external dependencies at the module level:

- **OpenAI SDK**: Mocked with a class stub providing `audio.transcriptions.create`, `audio.speech.create`, `chat.completions.create` as `vi.fn()`.
- **Prisma**: Mocked via `vi.mock('../../lib/prisma.js')` — either empty object or structured mock with method stubs.
- **@fastify/websocket**: Mocked as a no-op plugin (`async () => {}`).
- **LLM and TTS services**: Mocked in WS tests via `vi.mock()`.

#### `vi.hoisted()` for Mock Objects

`speech.test.ts` uses `vi.hoisted()` to create mock objects that are available before imports execute:

```typescript
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { question: { findUnique: vi.fn() }, ... }
}));
vi.mock('../../lib/prisma.js', () => ({ prisma: prismaMock }));
```

#### Dependency Injection for WebSocket Tests

`ws.test.ts` tests `hydrateWsConnection` and `handleWsIncomingMessage` as pure functions, injecting dependencies directly:

```typescript
await handleWsIncomingMessage({
  questionId: 'question-1',
  question,
  state,
  msg: { type: 'transcript_final', text: '...', ... },
  dependencies: { prismaClient: prismaMock, logger, sendMessage },
});
```

This avoids needing a real WebSocket connection or Fastify server for unit tests.

#### Fastify `app.inject()` for HTTP Tests

`server.test.ts` and `speech.test.ts` use Fastify's `app.inject()` for lightweight HTTP testing without a running server:

```typescript
const response = await app.inject({ method: 'GET', url: '/health' });
expect(response.statusCode).toBe(200);
```

#### Global Fetch Stubbing

`speech.test.ts` stubs `globalThis.fetch` via `vi.stubGlobal()` to mock the upstream Azure Speech token issuance.

#### Test Coverage

| File | Tests | What's Tested |
|------|-------|---------------|
| `server.test.ts` | 1 | Health endpoint basic response |
| `speech.test.ts` | 3 | Origin rejection, valid token issuance, regional endpoint filtering |
| `ws.test.ts` | 4 | Session hydration, question mismatch rejection, transcript persistence, feedback generation + persistence |
| `services/__tests__/` | 0 | Empty directory — LLM and TTS services have no unit tests |

---

## 11. Shared Package — `packages/shared`

Provides TypeScript interfaces and types consumed by both frontend and backend:

- Domain types: `Question`, `TestCase`, `InterviewSession`, `SessionMessage`, `StarterCode`
- WebSocket protocol types: `WsIncoming`, `WsOutgoing`, `WsSpeechStatus`, `SpeechRecognitionTiming`
- Code execution types: `CodeExecutionRequest`, `CodeExecutionResult`, `TestCaseResult`
- LLM types: `LLMFeedbackRequest`, `LLMFeedbackResponse`
- Language support: `SupportedLanguage`, `SUPPORTED_LANGUAGES`

---

## 12. Build and Runtime Configuration

### TypeScript

- Root `tsconfig.json`: `ES2022` target, `Node16` module/resolution, strict, composite with project references.
- Backend `tsconfig.json`: extends root, `outDir: dist`, `rootDir: src`, references `packages/shared`.

### Package Manager

- pnpm workspaces (`pnpm-workspace.yaml`).
- Shared package referenced as `"@agentsgalore/shared": "workspace:*"`.

### Backend Scripts

- `dev`: `tsx watch src/server.ts` (live reload).
- `build`: `tsc`.
- `start`: `node dist/server.js`.

### Dependencies Summary

| Package | Version | Purpose |
|---------|---------|---------|
| `fastify` | ^5.2.1 | HTTP framework |
| `@fastify/cors` | ^11.0.0 | CORS middleware |
| `@fastify/websocket` | ^11.0.1 | WebSocket support |
| `@prisma/client` | ^7.4.2 | ORM client |
| `@prisma/adapter-pg` | ^7.4.2 | PostgreSQL driver adapter |
| `dotenv` | ^16.4.7 | Environment loading |
| `openai` | ^6.25.0 | Azure OpenAI SDK (LLM + TTS) |
| `prisma` | ^7.4.2 | Dev: migrations, generation |
| `tsx` | ^4.19.2 | Dev: TypeScript execution |

---

## Key Architectural Decisions Summary

1. **Fastify over Express/Hono**: Chosen for performance, plugin encapsulation, built-in validation types, and structured logging.
2. **WebSocket for real-time interview**: Single WS connection per interview carries code updates, speech transcripts, AI feedback, and TTS audio.
3. **Dependency injection in WS handlers**: Extracted testable functions with injectable dependencies rather than testing through the WebSocket protocol.
4. **Azure OpenAI for both LLM and TTS**: Single SDK (`openai` npm package) with separate deployment configs for chat and speech synthesis.
5. **Dual speech architecture**: STT runs client-side (Azure Cognitive Services SDK with server-issued tokens); TTS runs server-side (Azure OpenAI API) with audio sent over WS.
6. **No authentication**: Intentionally anonymous — no user model, no auth middleware.
7. **No streaming LLM**: Full completion awaited; feedback responses are short (max 500 tokens) so streaming overhead is unnecessary.
8. **Prisma with driver adapter**: Uses `@prisma/adapter-pg` for PostgreSQL, enabling Prisma v7's new driver adapter architecture.
9. **Module-scope env loading**: Services call `loadBackendEnv()` at import time to ensure env vars are available before SDK clients initialize (addresses ESM import ordering).
10. **In-memory rate limiting**: Speech token rate limiter is per-process; won't work across multiple instances.

---

## Outstanding Questions / Potential Research

- [ ] How does the frontend code execution (`nodepod-runner.ts`, `run-tests.ts`) work? (Out of scope for backend research.)
- [ ] Is there a plan to add authentication? The `drop_user_model` migration suggests one was removed.
- [ ] Are there integration/e2e tests for the backend API or WebSocket? (Only unit tests found.)
- [ ] What monitoring/observability is in place beyond Fastify's Pino logger?

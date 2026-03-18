---
title: Architecture
description: Architectural overview and key design decisions for the live coding interview simulator.
author: Microsoft
ms.date: 2026-03-17
ms.topic: concept
keywords:
  - architecture
  - design decisions
  - live interview
estimated_reading_time: 15
---

## High-Level Architecture

```text
┌──────────────────────┐        WebSocket         ┌──────────────────────┐
│      Frontend         │◄───────────────────────►│       Backend         │
│     (Next.js 16)      │       REST API          │     (Fastify v5)      │
│     port 3000         │◄───────────────────────►│     port 3001         │
│                        │                         │                        │
│  ┌──────────────────┐ │                         │  ┌──────────────────┐ │
│  │  Monaco Editor    │ │                         │  │  Routes           │ │
│  │  Zustand Store    │ │                         │  │  questions        │ │
│  │  NodePod (WASM)   │ │                         │  │  sessions         │ │
│  │  Azure Speech SDK │ │                         │  │  speech (tokens)  │ │
│  └──────────────────┘ │                         │  │  ws (real-time)   │ │
└──────────────────────┘                          │  └──────────────────┘ │
                                                   │           │            │
                                                   │  ┌────────▼─────────┐ │
                                                   │  │ Services          │ │
                                                   │  │  LLM (GPT-4o)    │ │
                                                   │  │  TTS (Azure)      │ │
                                                   │  └──────────────────┘ │
                                                   │           │            │
                                                   │  ┌────────▼─────────┐ │
                                                   │  │ Prisma + PG 16   │ │
                                                   │  └──────────────────┘ │
                                                   └──────────────────────┘
```

The system is a pnpm monorepo with three packages (`@live-interviewer/shared`, `@live-interviewer/backend`, `@live-interviewer/frontend`). The frontend handles all user interaction, code execution, and speech recognition. The backend manages data persistence, AI feedback generation, and speech token issuance. A shared types package enforces compile-time contracts between both.

## Monorepo Structure

The project uses pnpm workspaces with a flat `packages/*` layout. Three packages live under `packages/`:

| Package                                      | Purpose                                             |
|----------------------------------------------|-----------------------------------------------------|
| `packages/shared` (`@live-interviewer/shared`)   | Domain types, WebSocket message schemas, language registry |
| `packages/backend` (`@live-interviewer/backend`) | Fastify API server, database, AI services           |
| `packages/frontend` (`@live-interviewer/frontend`)| Next.js web app, code editor, speech recognition    |

TypeScript project references enable incremental builds across `shared` and `backend`. The frontend is excluded from root project references because Next.js uses `moduleResolution: "bundler"` instead of `Node16`.

The shared package serves as the single source of truth for all cross-boundary types: domain models (`Question`, `InterviewSession`, `SessionMessage`), WebSocket discriminated unions (`WsIncoming`, `WsOutgoing`), supported languages, and speech timing types. Changes to the protocol surface compile errors in both consumers immediately.

## Frontend

### Rendering Strategy

The frontend uses Next.js 16 with App Router. Each page chooses its rendering strategy independently:

| Route                     | Strategy        | Reason                                          |
|---------------------------|-----------------|--------------------------------------------------|
| `/` (Home)                | Server component | Static landing page, SSG-eligible               |
| `/dashboard`              | Client component | Runtime data fetching for question list          |
| `/interview/[questionId]` | Client component | Monaco editor, WebSocket, speech, code execution |

### State Management

A single flat Zustand store (`useInterviewStore`) holds all interview state: question ID, session ID, code, WebSocket connection status, speech status, messages, test results, and selected language. No React Context providers are used anywhere. The store supports both reactive hook access and imperative `getState()` access in callbacks and effects.

### Code Execution

Code runs entirely in the browser using `@scelar/nodepod`, a WASM-based Node.js runtime. This eliminates server-side execution complexity, provides instant feedback, and leverages WASM sandboxing for isolation.

The implementation uses a singleton boot pattern (boot once, reuse across executions). TypeScript is transpiled in-browser via `ts.transpileModule` before execution. A 10-second timeout guards against infinite loops.

COOP/COEP headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: credentialless`) are set on all routes via `next.config.ts` to enable `SharedArrayBuffer`, which the WASM runtime requires.

Only JavaScript and TypeScript are supported. Adding a new language would require server-side execution infrastructure.

### Speech Recognition

Browser-side speech-to-text uses the Azure Cognitive Services Speech SDK with continuous recognition. The backend issues short-lived tokens (10-minute TTL) via `POST /api/speech/token`. The frontend auto-refreshes tokens 60 seconds before expiry.

The recognition hook manages a full lifecycle state machine: `idle` → `starting` → `listening` → `stopping` → `idle` (or `error`). Timing data (offset, duration) is extracted from SDK results and sent with final transcripts to the backend.

## Backend

### HTTP Framework

Fastify v5 with plugin-based route encapsulation. Each route module exports an async function registered via `app.register(plugin, { prefix })`. Built-in Pino logging provides structured request/response tracing. CORS is locked to the `FRONTEND_URL` origin.

### API Surface

| Method | Path                  | Purpose                                         |
|--------|-----------------------|-------------------------------------------------|
| GET    | `/health`             | Health check                                    |
| GET    | `/api/questions`      | List questions with visible test cases and starters |
| GET    | `/api/questions/:id`  | Single question detail                          |
| POST   | `/api/sessions`       | Create interview session                        |
| GET    | `/api/sessions`       | List sessions (filterable by status)            |
| GET    | `/api/sessions/:id`   | Session with messages                           |
| PATCH  | `/api/sessions/:id`   | Update code or status                           |
| POST   | `/api/speech/token`   | Issue Azure Speech auth token                   |
| GET    | `/api/ws`             | WebSocket upgrade for real-time interview       |

### WebSocket Protocol

A single WebSocket connection per interview session carries all real-time data. Connection state (code, conversation history, bound session ID) is held in-memory per connection and rehydrated from the database on reconnect.

Client-to-server messages:

| Type               | Purpose                                              |
|--------------------|------------------------------------------------------|
| `code_update`      | Sync editor code to server; persisted if session-bound |
| `transcript_final` | Final speech transcript with timing data             |
| `speech_status`    | Mic lifecycle updates (debug-logged)                 |
| `request_feedback` | Trigger AI interviewer response (optionally with TTS) |

Server-to-client messages:

| Type        | Purpose                                    |
|-------------|--------------------------------------------|
| `transcript`| Echo of finalized user speech              |
| `feedback`  | AI feedback with type classification       |
| `error`     | Error notifications                        |
| `audio`     | Base64-encoded opus TTS audio              |

A session ID mismatch guard on every incoming message prevents cross-session data leaks.

### AI Integration

The LLM service uses Azure OpenAI (GPT-4o) via the `openai` npm package. Completions are non-streaming with JSON structured output. The system prompt establishes a technical interviewer persona that guides without giving direct answers, asks clarifying questions, and evaluates communication. Responses are typed as `clarification`, `hint`, `feedback`, `confirmation`, or `follow-up`.

Configuration: temperature 0.7, max 500 tokens, 20-message conversation window.

Non-streaming was chosen because feedback responses are short (2-3 sentences per the system prompt), making streaming overhead unnecessary.

### Text-to-Speech

Server-side TTS uses Azure OpenAI with the `alloy` voice in `opus` format. Audio is delivered over the existing WebSocket connection as base64-encoded buffers. Separate TTS-specific endpoint/key/version env vars are supported, falling back to the main OpenAI configuration.

The dual-path speech architecture (client-side STT, server-side TTS) keeps API keys server-side for TTS while leveraging the browser's audio pipeline for low-latency continuous recognition.

### Speech Token Security

The token endpoint implements three layers of protection without user authentication:

* Origin validation against `FRONTEND_URL`
* IP-based sliding-window rate limiting (10 requests per 60 seconds)
* Scope verification: requests must reference a valid `questionId` or `sessionId` in the database

Rate limiting is in-memory (per-process). This works for single-instance deployment but would need Redis or similar for multi-instance scenarios.

## Database

### Schema

Five models with four enums, managed by Prisma v7 with the `@prisma/adapter-pg` driver adapter:

```text
Question (1) ──< TestCase          (cascade delete)
Question (1) ──< StarterCode       (cascade delete, unique per language)
Question (1) ──< InterviewSession   (restrict delete)
InterviewSession (1) ──< SessionMessage (cascade delete)
```

All primary keys use CUID (`@default(cuid())`), which is collision-resistant, globally unique, and sortable by creation time.

The delete strategy is intentional: cascade removes child records on parent deletion, while restrict on `InterviewSession → Question` prevents deleting questions that have active sessions.

### Multi-Language Starter Code

Starter code was originally a single text column on `Question`. Migration `20260307141325` extracted it into a normalized `StarterCode` model with a composite unique constraint on `(questionId, language)`. New languages can be added without schema changes.

TypeScript starters use class-based OOP patterns. JavaScript starters use closure-based factory functions, showcasing idiomatic patterns for each language.

### Schema Evolution

The schema evolved across four migrations over three days:

| Date   | Migration                                | Change                                           |
|--------|------------------------------------------|--------------------------------------------------|
| Mar 5  | `20260305140542_init`                    | Full schema with `User` table and auth columns   |
| Mar 6  | `20260306000000_drop_clerk_id`           | Remove external auth ID column from `User`       |
| Mar 7  | `20260307000000_drop_user_model`         | Drop `User` table entirely, remove `userId` FK   |
| Mar 7  | `20260307141325_add_starter_code_per_language` | Normalize starter code into its own model   |

The auth removal was a deliberate pivot from authenticated sessions to anonymous-first design. The app prioritizes frictionless "jump into an interview" UX over identity management. Sessions are identified only by their CUID.

## Key Design Decisions

### ESM-First

The entire project uses `"type": "module"` with ES2022 target. Backend and shared packages use Node16 module resolution; the frontend uses bundler resolution (Next.js convention). This requires `.js` extensions in backend/shared imports and module-scope environment loading to avoid ESM import-order issues.

### Module-Scope Environment Loading

Services (`llm.ts`, `tts.ts`, `prisma.ts`) call `loadBackendEnv()` at module scope before constructing SDK client instances. This guarantees environment variables are loaded regardless of ESM import order. The loader reads root `.env` first, then optionally overrides from `packages/backend/.env`.

### Dependency Injection for WebSocket Handlers

The WebSocket message handler and connection hydrator are extracted as pure async functions accepting a `dependencies` object (Prisma client, feedback generator, speech synthesizer, logger, message sender). This enables full unit testing without a live WebSocket connection. The Prisma client interfaces are hand-written subsets, not the full generated type, keeping mocks lightweight.

### No Authentication

The project originally included user authentication, which was intentionally removed across two migrations. All endpoints are anonymous. Sessions have no user association. The speech token endpoint compensates with origin validation, rate limiting, and scope verification.

### In-Memory WebSocket State

Connection state (code, conversation history, bound session ID) lives in-memory per WebSocket connection. On reconnect, state is rehydrated from the database using the `sessionId` query parameter. This approach avoids external state stores (Redis) at the cost of not supporting multi-instance deployment without modification.

### Descriptive Test Cases

Test cases use natural-language `input` and `expectedOutput` fields rather than executable assertions. They serve as behavioral specifications for the LLD interview context. The NodePod test runner validates output via string matching (`stdout.trim() === expectedOutput.trim()`).

## Testing Strategy

### Unit Tests

Vitest runs from a centralized root configuration scanning `packages/*/src/**/*.test.ts`. Global test APIs are enabled (`describe`, `it`, `expect` are available without import). Tests live in `__tests__/` directories adjacent to their source.

Mocking patterns:

* Module-level mocks via `vi.mock()` for external dependencies (OpenAI SDK, Prisma, Fastify plugins)
* `vi.hoisted()` for mock objects that need to exist before imports execute
* Fastify `app.inject()` for lightweight HTTP testing without a running server
* Dependency injection for WebSocket handler tests (no live WebSocket needed)
* `vi.resetModules()` with dynamic `import()` for module-level singleton isolation

### E2E Tests

Playwright targets Chromium only with one test covering the navigation flow (home → dashboard → interview). The test mocks API routes via `page.route()` and does not require running backend services.

E2E tests are excluded from CI because the pipeline does not provision PostgreSQL or start the backend. The CI pipeline runs five sequential gates: lint → format check → typecheck → test → build.

## Known Limitations

* Rate limiting is in-memory (per-process); multi-instance deployment needs shared state
* WebSocket connection state is in-memory; no horizontal scaling without a state store
* Code execution supports only JavaScript and TypeScript (NodePod WASM limitation)
* No production deployment configuration exists (no Dockerfiles for the app, no cloud infra)
* Service layer (LLM, TTS) has no unit tests
* E2E tests are not run in CI

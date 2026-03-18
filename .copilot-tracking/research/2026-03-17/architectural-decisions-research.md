<!-- markdownlint-disable-file -->
# Task Research: Architectural Decision Documentation

Comprehensive identification and cataloging of all architectural decisions in the AgentsGalore live-interview repository, to shore up documentation and ensure every significant design choice is explicitly recorded.

## Task Implementation Requests

* Scan the entire codebase and identify all architectural decisions
* Catalog each decision with context, rationale, alternatives considered, and current status
* Assess existing documentation coverage and identify gaps
* Produce a complete inventory suitable for creating ADR (Architecture Decision Record) documents

## Scope and Success Criteria

* Scope: All packages (shared, backend, frontend), infrastructure config, CI pipeline, database schema, testing strategy, AI integrations, and deployment approach
* Assumptions: The repository is the sole source of truth; no external architecture docs exist beyond the README
* Success Criteria:
  * Every significant architectural decision is identified and categorized
  * Each decision includes context, rationale (inferred from code/migrations where explicit rationale is absent), and status
  * Gaps in existing documentation are flagged
  * The research is actionable — suitable for creating formal ADRs

## Outline

1. Existing Documentation Assessment
2. Complete Architectural Decision Inventory (grouped by domain)
3. Documentation Gap Analysis
4. Recommended Approach for ADR Documentation
5. Evaluated Alternatives

## Research Executed

### File Analysis

* README.md (L1–273): Existing project docs — architecture diagram, tech stack table, project structure, setup guide, scripts, troubleshooting
* package.json: Root monorepo config — ESM, pnpm 9.15.4, Node >= 20, unified scripts
* docker-compose.yml: PostgreSQL 16 only
* pnpm-workspace.yaml: Flat `packages/*` layout
* tsconfig.json: Composite project references (shared + backend only; frontend excluded)
* vitest.config.ts: Centralized test runner across all packages
* eslint.config.js: Flat config, strict no-any rule
* playwright.config.ts: Chromium-only E2E, auto-starts frontend dev server
* packages/backend/src/server.ts: Fastify v5, plugin-based route registration, test guard
* packages/backend/src/routes/questions.ts: Read-only question API with eager loading
* packages/backend/src/routes/sessions.ts: Anonymous session CRUD with code size validation
* packages/backend/src/routes/speech.ts: Token issuer with origin validation, rate limiting, scope verification
* packages/backend/src/routes/ws.ts: WebSocket with DI-based handler extraction, in-memory state, session mismatch guards
* packages/backend/src/services/llm.ts: Azure OpenAI non-streaming, JSON structured output, 20-message window
* packages/backend/src/services/tts.ts: Azure OpenAI TTS, opus format, server-side synthesis
* packages/backend/src/lib/env.ts: Dual-layer env loading (root → package override)
* packages/backend/src/lib/prisma.ts: Singleton with driver adapter, module-scope env load
* packages/backend/prisma/schema.prisma: 5 models, 4 enums, CUID IDs, cascade/restrict deletes
* packages/backend/prisma/seed.ts: 8 LLD questions with multi-language starters and hidden test cases
* packages/backend/prisma.config.ts: Prisma v7 defineConfig with loadBackendEnv
* All 4 migration SQL files: Schema evolution from Clerk auth → anonymous
* packages/frontend/src/app/layout.tsx, page.tsx, dashboard/page.tsx, interview/[questionId]/page.tsx: App Router pages, SSR home + CSR interview
* packages/frontend/src/hooks/use-azure-speech-recognition.ts: Azure Speech SDK continuous recognition with token auto-refresh
* packages/frontend/src/hooks/use-interview-socket.ts: Auto-reconnecting WebSocket hook
* packages/frontend/src/lib/api.ts: Typed fetch wrapper
* packages/frontend/src/lib/execution/nodepod-runner.ts: WASM singleton runtime, TS transpilation, 10s timeout
* packages/frontend/src/lib/execution/run-tests.ts: Sequential test execution
* packages/frontend/src/stores/interview-store.ts: Zustand flat store, derived isMicOn
* packages/shared/src/index.ts: Domain types, WS protocol types, language registry
* All test files (8 backend tests, 19 frontend tests, 5 shared tests, 1 E2E test)

### Project Conventions

* Standards referenced: ESM modules, strict TypeScript, Fastify plugin pattern, Prisma driver adapter
* Instructions followed: Repository README, pnpm workspace conventions

## Key Discoveries

### Existing Documentation State

The README covers setup, tech stack, project structure, and basic architecture diagram. It does **not** document:

- Why specific technologies were chosen over alternatives
- Architectural decisions and their rationale
- The WebSocket message protocol
- The speech recognition flow (token issuance, client-side recognition)
- The code execution sandboxing model
- Database schema design decisions
- The auth removal decision and rationale
- Testing strategy rationale
- Security model and boundaries
- State management approach

### Documentation Gaps Identified

| Gap | Severity | Current State |
|-----|----------|---------------|
| No ADRs or decision log | High | Decisions are implicit in code; no rationale recorded |
| WebSocket protocol undocumented | High | 4 incoming + 4 outgoing message types with no spec |
| Auth removal rationale missing | Medium | Migration history shows Clerk was removed but no explanation |
| Code execution security model undocumented | Medium | COOP/COEP headers, WASM sandbox — not explained |
| Speech architecture undocumented | Medium | Dual-path STT/TTS split across client/server |
| Testing strategy undocumented | Low | Implicit in config; no explanation of coverage goals |
| Deployment strategy missing | Low | No deployment config exists; local-dev only |

## Complete Architectural Decision Inventory

### ADR-001: Monorepo with pnpm Workspaces

* **Status**: Active
* **Context**: The project needs shared types between frontend and backend with a unified development experience
* **Decision**: pnpm workspace monorepo with 3 packages (`shared`, `backend`, `frontend`) under `packages/`
* **Rationale**: pnpm workspaces provide strict dependency isolation (no phantom deps), efficient disk usage via hard links, and `workspace:*` protocol for internal dependencies. TypeScript project references enable incremental cross-package type-checking.
* **Alternatives not chosen**:
  - Turborepo/Nx: Adds build orchestration overhead unnecessary for 3 packages
  - npm/yarn workspaces: pnpm's strict mode catches dependency issues earlier
  - Separate repos: Breaks shared type contracts and complicates development

### ADR-002: Shared Types Package as Contract

* **Status**: Active
* **Context**: Frontend and backend need to agree on domain types and WebSocket message schemas
* **Decision**: A dedicated `@agentsgalore/shared` package exports all domain types, WebSocket message discriminated unions, language registry, and speech types
* **Rationale**: Single source of truth prevents type drift between frontend and backend. Changes to the protocol surface compile errors in both consumers immediately.
* **Evidence**: packages/shared/src/index.ts — exports `WsIncoming`, `WsOutgoing`, `Question`, `InterviewSession`, `SupportedLanguage`, etc.

### ADR-003: Fastify v5 over Express/Hono

* **Status**: Active
* **Context**: Backend needs HTTP routes, WebSocket support, structured logging, and plugin encapsulation
* **Decision**: Fastify v5 with `@fastify/cors` and `@fastify/websocket`
* **Rationale**: Fastify provides built-in Pino structured logging, plugin encapsulation for routes, type-safe request/reply, and native WebSocket integration via `@fastify/websocket`. Performance characteristics superior to Express.
* **Alternatives not chosen**:
  - Express: No built-in logging, less performant, no native plugin encapsulation
  - Hono: Focused on edge/serverless; less mature WebSocket support
* **Evidence**: packages/backend/src/server.ts — `buildApp()` demonstrates plugin registration pattern

### ADR-004: Next.js App Router (v16)

* **Status**: Active
* **Context**: Frontend needs SSR/SSG for landing page, client-side rendering for interactive interview workspace
* **Decision**: Next.js 16 with App Router, React 19
* **Rationale**: App Router enables per-page rendering strategy (server components for static content, client components for interactive pages). React 19 `use()` API for async params. Next.js handles COOP/COEP header injection needed for SharedArrayBuffer.
* **Evidence**: packages/frontend/src/app/ — server component home page, `'use client'` interview page

### ADR-005: Anonymous Sessions (Auth Removal)

* **Status**: Active (deliberate decision, not temporary)
* **Context**: Initial design included Clerk authentication with a User model. The project pivoted to prioritize frictionless access.
* **Decision**: Remove Clerk auth entirely — drop User model, make all sessions anonymous
* **Migration timeline**:
  - Mar 5: Initial schema with Clerk `clerkId`, `User` table, `userId` FK on sessions
  - Mar 6: Drop `clerkId` column (migration: `20260306000000_drop_clerk_id`)
  - Mar 7: Drop `User` table and `userId` FK entirely (migration: `20260307000000_drop_user_model`)
* **Rationale**: Prioritize "jump into an interview" UX without sign-up friction. The app functions as a practice tool where user identity tracking adds complexity without clear value.
* **Consequences**: Sessions identified only by CUID. No session ownership verification. No user history tracking.

### ADR-006: In-Browser Code Execution via NodePod WASM

* **Status**: Active
* **Context**: Users need to execute JavaScript/TypeScript code during interviews. Server-side execution introduces latency, security risks, and infrastructure costs.
* **Decision**: Client-side code execution using `@scelar/nodepod` (WASM-based Node.js runtime in the browser)
* **Rationale**: Zero server load, instant execution feedback, inherent sandboxing via WASM. No container orchestration needed. Trade-off: requires COOP/COEP headers (set via `next.config.ts`) for `SharedArrayBuffer` access.
* **Implementation details**:
  - Singleton boot pattern (boot once, reuse across executions)
  - TypeScript transpiled in-browser via `ts.transpileModule`
  - 10-second execution timeout with best-effort process kill
  - Stdin simulated by monkey-patching `fs.readFileSync`
* **Limitations**: Only JS/TS supported. No multi-language server-side execution.
* **Evidence**: packages/frontend/src/lib/execution/nodepod-runner.ts, next.config.ts COOP/COEP headers

### ADR-007: Dual-Path Speech Architecture (Client STT, Server TTS)

* **Status**: Active
* **Context**: The app needs both speech-to-text (user speaks their thought process) and text-to-speech (AI feedback read aloud)
* **Decision**: Split architecture:
  - **STT (Speech-to-Text)**: Client-side via Azure Cognitive Services Speech SDK. Backend issues time-limited tokens; recognition runs in the browser.
  - **TTS (Text-to-Speech)**: Server-side via Azure OpenAI TTS API. Audio sent over WebSocket as base64-encoded opus.
* **Rationale**:
  - Client-side STT: Lower latency for continuous recognition, runs alongside the browser's audio pipeline, reduces server load
  - Server-side TTS: Keeps Azure OpenAI API keys server-side, avoids CORS issues with Azure TTS endpoints, enables audio delivery over the existing WebSocket connection
* **Token security**: Tokens are origin-validated, rate-limited (10/min per IP), and scope-verified against DB entities
* **Evidence**: packages/frontend/src/hooks/use-azure-speech-recognition.ts, packages/backend/src/routes/speech.ts, packages/backend/src/services/tts.ts

### ADR-008: WebSocket for Real-Time Interview Communication

* **Status**: Active
* **Context**: Interview sessions need real-time bidirectional communication for code updates, speech transcripts, AI feedback, and audio delivery
* **Decision**: Single WebSocket connection per interview carrying all real-time data
* **Protocol**:
  - **Client → Server**: `code_update`, `transcript_final`, `speech_status`, `request_feedback`
  - **Server → Client**: `transcript`, `feedback`, `error`, `audio`
* **Connection state**: In-memory per connection (code, conversation history, bound session ID). Rehydrated from DB on reconnect via `sessionId` query parameter.
* **Rationale**: Single persistent connection avoids polling overhead and enables server-push (AI feedback, TTS audio). Discriminated union message types (from shared package) provide type safety.
* **Security**: Session ID mismatch guard prevents cross-session data leaks.
* **Evidence**: packages/backend/src/routes/ws.ts, packages/shared/src/index.ts (WsIncoming/WsOutgoing types)

### ADR-009: Azure OpenAI for LLM (Non-Streaming)

* **Status**: Active
* **Context**: AI interviewer needs to generate contextual feedback based on user's code and speech
* **Decision**: Azure OpenAI GPT-4o via the `openai` npm package, non-streaming completions with JSON structured output
* **Configuration**: Temperature 0.7, max 500 tokens, 20-message conversation window
* **Rationale**: Non-streaming chosen because feedback responses are short (2-3 sentences per the system prompt). JSON structured output (`{ content, type }`) enables typed feedback categories (clarification, hint, feedback, confirmation, follow-up).
* **Alternatives not chosen**:
  - Streaming: Unnecessary overhead for short responses; structured JSON output doesn't benefit from streaming
  - Direct OpenAI: Azure provides enterprise features and data residency
* **Evidence**: packages/backend/src/services/llm.ts

### ADR-010: Zustand for State Management (No Context)

* **Status**: Active
* **Context**: Interview page needs shared state across multiple logical concerns (editor, speech, WebSocket, test results)
* **Decision**: Single flat Zustand store with no middleware, no React Context providers
* **Rationale**: Zustand is minimal, supports both reactive hooks and imperative `getState()` access (needed in callbacks/effects), requires no provider wrappers, and avoids unnecessary re-renders via selector-based subscriptions.
* **Implementation**: `isMicOn` derived from `speechStatus` in setter (not computed getter). `reset()` restores to initial state.
* **Alternatives not chosen**:
  - React Context: Requires providers, causes re-render cascades without `useMemo`
  - Redux: Excessive boilerplate for a single-store use case
  - Jotai/Recoil: Atom-based models add complexity for what amounts to a single flat state shape
* **Evidence**: packages/frontend/src/stores/interview-store.ts

### ADR-011: Prisma v7 with Driver Adapter Pattern

* **Status**: Active
* **Context**: App needs an ORM for PostgreSQL with type-safe queries and migration management
* **Decision**: Prisma v7 with `@prisma/adapter-pg` driver adapter, generated client checked into `src/generated/prisma/`
* **Rationale**: Prisma provides type-safe queries, declarative schema, migration tooling, and the new driver adapter architecture allows using the `pg` driver directly (better control over connection pooling and configuration).
* **Patterns**: Direct Prisma calls in routes (no repository abstraction layer), `$transaction` for atomic writes, global singleton with dev hot-reload protection.
* **Evidence**: packages/backend/prisma.config.ts, packages/backend/src/lib/prisma.ts

### ADR-012: CUID for All Primary Keys

* **Status**: Active
* **Context**: All models need unique identifiers
* **Decision**: CUID (`@default(cuid())`) stored as TEXT for all primary keys
* **Rationale**: CUIDs are collision-resistant, globally unique, sortable by creation time, and client-generatable (no DB round-trip). No auto-increment integers — fully distributed-safe.
* **Trade-off**: Slightly larger storage than UUIDs or integers; acceptable at current scale
* **Evidence**: packages/backend/prisma/schema.prisma — all models use `@default(cuid())`

### ADR-013: Multi-Language Starter Code as Normalized Model

* **Status**: Active
* **Context**: Originally questions had a single `starterCode` text field. Need to support multiple language variants.
* **Decision**: Extracted `StarterCode` model with composite unique constraint `(questionId, language)`
* **Migration**: `20260307141325_add_starter_code_per_language` — dropped column, created table
* **Rationale**: Adding new languages requires no schema changes. Each language has independent starter code versioning. Composite unique prevents duplicate entries.
* **Pattern**: TypeScript starters use class-based OOP; JavaScript starters use closure-based functional factories
* **Evidence**: packages/backend/prisma/schema.prisma (StarterCode model), packages/backend/prisma/seed.ts

### ADR-014: Cascade/Restrict Delete Strategy

* **Status**: Active
* **Context**: Need referential integrity rules for parent-child relationships
* **Decision**:
  - `TestCase`, `StarterCode`, `SessionMessage` → CASCADE delete from parent
  - `InterviewSession` → Question uses RESTRICT delete
* **Rationale**: Cascade removes child records when a parent is deleted (cleanup). Restrict on Question → InterviewSession prevents accidental deletion of questions that have active interview sessions (protects history).
* **Evidence**: packages/backend/prisma/schema.prisma — `onDelete` annotations

### ADR-015: Dependency Injection for WebSocket Handler Testability

* **Status**: Active
* **Context**: WebSocket handlers are complex (DB access, LLM calls, TTS, message sending) and hard to test through the protocol
* **Decision**: Extract `handleWsIncomingMessage` and `hydrateWsConnection` as pure async functions accepting a `dependencies` object with injectable Prisma client, feedback generator, speech synthesizer, logger, and message sender
* **Rationale**: Enables full unit testing without a live WebSocket connection or Fastify server. Hand-written Prisma client interface subsets allow lightweight mock creation.
* **Alternatives not chosen**:
  - Integration tests with live WebSocket: Slower, more fragile, harder to isolate failure causes
  - Testing through HTTP (Fastify inject): Doesn't work for WebSocket protocol
* **Evidence**: packages/backend/src/routes/ws.ts (WsMessageHandlerDependencies interface)

### ADR-016: Centralized Test Runner with Root Vitest Config

* **Status**: Active
* **Context**: Three packages need unit testing with consistent configuration
* **Decision**: Single root `vitest.config.ts` with global APIs, scanning `packages/*/src/**/*.test.ts`
* **Rationale**: Unified test execution, single CI step, consistent settings across packages. No per-package config maintenance.
* **Trade-off**: Cannot have package-specific test settings without workspace-level Vitest config
* **Evidence**: vitest.config.ts, package.json `test` script

### ADR-017: No E2E Tests in CI

* **Status**: Active (limitation)
* **Context**: E2E tests require a running database, backend server, and frontend — none provisioned in CI
* **Decision**: Playwright E2E tests are configured but excluded from the CI pipeline (only `pnpm test` runs, not `pnpm test:e2e`)
* **Rationale**: CI doesn't provision PostgreSQL services or start the backend. E2E tests use API route mocking in the one existing test, but the full integration path requires running services.
* **Consequence**: E2E coverage exists only for the navigation flow (home → dashboard → interview) with mocked API responses
* **Evidence**: .github/workflows/ci.yml, playwright.config.ts, packages/frontend/e2e/initial-flow.spec.ts

### ADR-018: ESM-First Architecture

* **Status**: Active
* **Context**: The project uses modern TypeScript with Node.js 20+
* **Decision**: `"type": "module"` at root and all packages. ES2022 target. Node16 module resolution for backend/shared; bundler resolution for frontend (Next.js convention).
* **Rationale**: ESM is the Node.js standard going forward. Enables top-level await, tree-shaking in frontend builds, and consistent module semantics.
* **Consequence**: Requires `.js` extensions in imports for backend/shared packages. Module-scope env loading addresses ESM import-order initialization issues.
* **Evidence**: package.json, tsconfig.json, packages/backend/src/lib/env.ts (module-scope `loadBackendEnv()` calls)

### ADR-019: Module-Scope Environment Loading

* **Status**: Active
* **Context**: ESM import order can initialize SDK clients before `dotenv.config()` runs, resulting in undefined env vars
* **Decision**: Services (`llm.ts`, `tts.ts`, `prisma.ts`) call `loadBackendEnv()` at module scope before constructing client instances
* **Rationale**: Guarantees env vars are loaded regardless of import order. The `loadBackendEnv()` function loads root `.env` first, then `packages/backend/.env` with override semantics.
* **Evidence**: packages/backend/src/services/llm.ts, packages/backend/src/services/tts.ts, packages/backend/src/lib/prisma.ts — all import and call `loadBackendEnv()` at top level

### ADR-020: In-Memory Rate Limiting for Speech Token Endpoint

* **Status**: Active (with known limitation)
* **Context**: Speech token endpoint needs abuse prevention without user authentication
* **Decision**: In-memory sliding-window rate limiter (10 requests/60 seconds per IP) in the speech route
* **Rationale**: Simple, no external dependency (Redis), adequate for single-instance deployment
* **Known limitation**: Won't work across multiple server instances — rate limit state is per-process
* **Evidence**: packages/backend/src/routes/speech.ts

### ADR-021: Tailwind CSS v4 Without Component Library

* **Status**: Active
* **Context**: Frontend needs styling without heavy dependencies
* **Decision**: Tailwind CSS v4 via PostCSS with hand-crafted utility classes. No component library (no shadcn/ui, Radix, MUI).
* **Rationale**: Maximal flexibility, minimal bundle size, no component library lock-in. Dark mode via CSS `prefers-color-scheme`.
* **Trade-off**: Monolithic page components (~400 lines in interview page) without shared UI components
* **Evidence**: packages/frontend/postcss.config.mjs, packages/frontend/src/app/globals.css

### ADR-022: Database-Only Docker (No App Containerization)

* **Status**: Active
* **Context**: Development infrastructure needs
* **Decision**: Docker Compose runs only PostgreSQL 16. No Dockerfiles for the application itself. No cloud deployment config.
* **Rationale**: Application runs natively during development (with hot reload via `tsx watch` and Next.js dev server). Docker overhead unnecessary for app processes in local development.
* **Consequence**: No production deployment path defined. No container images for the application.
* **Evidence**: docker-compose.yml — only `postgres:16-alpine` service

### ADR-023: Conversation Window (Last 20 Messages)

* **Status**: Active
* **Context**: LLM context window has token limits; conversation history grows over an interview session
* **Decision**: Send only the last 20 messages from conversation history to the LLM
* **Rationale**: Balances context availability with token budget. 20 messages at ~500 tokens/message fits well within GPT-4o's context window while keeping costs predictable.
* **Evidence**: packages/backend/src/services/llm.ts — `.slice(-20)` on conversation history

### ADR-024: Descriptive Test Cases (Not Machine-Executable)

* **Status**: Active
* **Context**: Interview questions need test cases for the candidate to reference
* **Decision**: Test cases have natural-language `input` and `expectedOutput` fields, not executable assertions
* **Rationale**: Test cases serve as behavioral specifications for the LLD interview context. The code execution (NodePod) validates against output string matching (`stdout.trim() === expectedOutput.trim()`), but the inputs are descriptive (e.g., "Park car1 in level 0, spot 1") rather than programmatic.
* **Evidence**: packages/backend/prisma/seed.ts — test case data

### ADR-025: Five-Gate CI Pipeline

* **Status**: Active
* **Context**: Need automated quality gates for PRs and pushes to main
* **Decision**: Sequential pipeline: lint → format check → typecheck → test → build
* **Rationale**: Fast fail on cheapest checks first. All steps must pass. Frozen lockfile prevents dependency drift.
* **Configuration**: Single job, sequential steps, Node 20, pnpm with `--frozen-lockfile`, ubuntu-latest
* **Evidence**: .github/workflows/ci.yml

## Technical Scenarios

### Scenario: Adding a New Language (e.g., Python)

**Requirements:**
* Add language to shared `SUPPORTED_LANGUAGES` registry
* Create starter codes for each question in the new language
* Update NodePod runner or implement server-side execution

**Impact**: ADR-006 (NodePod) would need re-evaluation — NodePod only supports JS/TS. Python would require server-side execution (fundamentally different architecture). ADR-013 (StarterCode model) supports this without schema changes.

### Scenario: Adding Authentication

**Requirements:**
* Re-introduce a User model or integrate external auth (Clerk, Auth0, etc.)
* Add auth middleware to routes
* Associate sessions with users

**Impact**: Directly conflicts with ADR-005 (anonymous sessions). Would need to be a deliberate reversal with migration to add user FK back to sessions.

### Scenario: Multi-Instance Deployment

**Requirements:**
* Shared state for WebSocket connections
* Distributed rate limiting

**Impact**: ADR-020 (in-memory rate limiting) and ADR-008 (in-memory WS state) would need Redis or similar for shared state. ADR-022 (no containerization) would need Dockerfiles and orchestration config.

## Selected Approach: ADR Documentation Format

### Recommended: Lightweight ADR Files

Create individual ADR markdown files in a `docs/decisions/` directory using a simplified format. Each file covers one decision with context, status, rationale, and consequences.

**Why this approach**:
- Industry-standard pattern (Michael Nygard's ADR format)
- Each decision is independently trackable (git blame shows when/why decisions changed)
- New team members can understand architectural context without reading all source code
- Supports superseding and deprecating decisions over time

**Proposed structure**:
```text
docs/decisions/
├── 0001-monorepo-pnpm-workspaces.md
├── 0002-shared-types-package.md
├── 0003-fastify-over-express.md
├── ...
└── 0025-five-gate-ci-pipeline.md
```

**Template per ADR**:
```markdown
# ADR-NNNN: Title

## Status
Active | Superseded by ADR-XXXX | Deprecated

## Context
What is the issue that we're seeing that is motivating this decision?

## Decision
What is the change that we're proposing and/or doing?

## Rationale
Why was this specific decision made over alternatives?

## Consequences
What becomes easier or more difficult to do because of this change?
```

### Considered Alternatives

**Alternative 1: Single ARCHITECTURE.md Document**
- Pros: Easy to maintain, single file to read, lower overhead
- Cons: Grows unwieldy, harder to track individual decision changes, no status lifecycle
- Rejected: Doesn't scale as the project grows; individual decisions can't be superseded independently

**Alternative 2: Decision Log in README**
- Pros: Most visible location, no new directory structure
- Cons: README is already long, mixes setup docs with architectural history
- Rejected: Pollutes the primary developer onboarding document

**Alternative 3: GitHub Wiki**
- Pros: Separate from code, rich editing
- Cons: Not version-controlled with the code, easy to get out of sync
- Rejected: Architectural decisions should live with the code they describe

## Potential Next Research

* Investigate whether the project should add an `ARCHITECTURE.md` summary alongside individual ADRs
  * Reasoning: A high-level overview linking to individual ADRs aids discoverability
  * Reference: Existing README architecture diagram could be expanded
* Research deployment architecture options (no production deployment path exists)
  * Reasoning: ADR-022 notes no containerization or cloud config
  * Reference: docker-compose.yml only has PostgreSQL
* Assess whether test coverage targets should be formalized
  * Reasoning: Service layer (LLM, TTS) has zero tests; no coverage threshold in CI
  * Reference: packages/backend/src/services/__tests__/ is empty

## Subagent Research Documents

* .copilot-tracking/research/subagents/2026-03-17/infra-config-research.md — Infrastructure, tooling, CI, Docker config
* .copilot-tracking/research/subagents/2026-03-17/backend-architecture-research.md — Backend API, services, WS protocol, testing
* .copilot-tracking/research/subagents/2026-03-17/frontend-shared-research.md — Frontend rendering, state, code execution, shared types
* .copilot-tracking/research/subagents/2026-03-17/database-schema-research.md — Schema evolution, migration history, seed strategy

# Infrastructure & Configuration Research — live-interview (AgentsGalore)

> Subagent research document — 2026-03-17

## Research Topics

- Monorepo structure, tooling, and workspace configuration
- Docker services and local development infrastructure
- TypeScript configuration and build strategy
- Testing strategy (unit, integration, E2E)
- Linting and formatting conventions
- CI pipeline design
- Environment variable management
- Key dependency choices and architectural decisions

---

## 1. README.md — Existing Documentation

**File:** `README.md`

### Technologies Documented

- Next.js (frontend), Fastify (backend), Prisma 7 + PostgreSQL (database)
- Azure OpenAI (GPT-4o for LLM feedback, TTS for voice output)
- Azure Speech SDK for browser-side speech-to-text (STT)
- Monaco Editor (in-browser code editor)
- Zustand (frontend state management)
- NodePod (in-browser code execution)
- Vitest (unit testing), Playwright (E2E — not documented in README tech stack table but present in config)
- GitHub Actions (CI)
- pnpm (package manager), Docker (PostgreSQL)

### Architectural Decisions

- **Monorepo with three packages:** `shared`, `backend`, `frontend` under `packages/`.
- **Shared types package:** TypeScript interfaces consumed by both backend and frontend.
- **WebSocket + REST API:** Real-time AI feedback over WebSocket; CRUD over REST.
- **Browser-side STT:** Azure Speech SDK tokens issued by the backend; recognition runs in the browser. The Whisper deployment is kept for backward-compat but unused in the current flow.
- **Single root `.env`:** Both frontend and backend read from a root `.env`; the backend also honors `packages/backend/.env` as an override.
- **Docker for DB only:** Only PostgreSQL is containerized; application services run natively.

### Conventions

- Port 3000 for frontend, 3001 for backend.
- `pnpm db:migrate` and `pnpm db:seed` for database lifecycle.
- Prerequisites: Node >= 20, pnpm >= 9, Docker.

---

## 2. package.json — Root Package Config

**File:** `package.json`

### Technologies & Tools

| Tool | Version Constraint |
|---|---|
| Node.js | >= 20.0.0 (engines field) |
| pnpm | 9.15.4 (packageManager field, pinned) |
| TypeScript | ^5.9.3 |
| Vitest | ^4.0.18 |
| Playwright | ^1.58.2 |
| ESLint | ^10.0.2 |
| Prettier | ^3.8.1 |
| jsdom | ^28.1.0 (for Vitest DOM tests) |
| @testing-library/react | ^16.3.2 |

### Architectural Decisions

- **ESM-first:** `"type": "module"` at root.
- **Corepack-managed pnpm:** Exact version pinned via `packageManager` field; `corepack enable` activates it.
- **Root-level dev tooling only:** No runtime dependencies at root. All dev tooling (lint, format, test, type-check) is hoisted to the root.
- **Unified scripts:** `pnpm dev` runs all packages in parallel; `pnpm build` builds recursively; `pnpm test` runs Vitest from root.
- **Split lint invocation:** The `lint` script explicitly runs ESLint via corepack for the frontend (which has its own `eslint.config.mjs` for Next.js rules) and separately for backend/shared/root files via the root ESLint config. This avoids config conflicts between Next.js ESLint and the root config.
- **Database scripts filter to backend:** `db:migrate` and `db:seed` use `--filter @agentsgalore/backend` to scope to the backend package.

### Conventions

- Private monorepo (`"private": true`).
- No `workspaces` field in package.json — pnpm uses `pnpm-workspace.yaml` exclusively.

---

## 3. docker-compose.yml — Docker Services

**File:** `docker-compose.yml`

### Technologies

- PostgreSQL 16 Alpine image.
- Named volume `pgdata` for data persistence.

### Architectural Decisions

- **Database-only containerization:** Only the database is Dockerized. No service containers for backend/frontend — they run natively during development.
- **Simple credentials:** `postgres/postgres` user/password, `agentsgalore` database. Suitable for local dev only.
- **Restart policy:** `unless-stopped` for resilience during development.
- **Standard port mapping:** `5432:5432`, directly accessible from host.

### Conventions

- Container named `agentsgalore-db` for easy reference in `docker compose ps`.

---

## 4. pnpm-workspace.yaml

**File:** `pnpm-workspace.yaml`

### Content

```yaml
packages:
  - "packages/*"
```

### Architectural Decisions

- **Flat package layout:** All workspace packages live directly under `packages/`. No nested groupings.
- **Wildcard inclusion:** All directories under `packages/` are workspace members.

---

## 5. tsconfig.json — Root TypeScript Config

**File:** `tsconfig.json`

### Technologies

- TypeScript with strict mode, ES2022 target, Node16 module resolution.

### Architectural Decisions

- **Project references (composite builds):** The root `tsconfig.json` uses `"composite": true` and `"references"` to `packages/shared` and `packages/backend`. This enables incremental builds with `tsc -b`.
- **Frontend excluded from root references:** The frontend (`packages/frontend`) is NOT in the root references. It uses its own `tsconfig.json` with `moduleResolution: "bundler"` (Next.js convention) instead of `Node16`. The root `tsc -b` type-checks shared + backend only.
- **Shared module resolution:** Node16 module resolution with `.js` extension imports (ESM-native).
- **Declaration maps:** `declarationMap: true` for source-level navigation across packages.
- **No files compiled at root:** `"files": []` means the root config only orchestrates references.

### Conventions

- Strict mode enforced globally.
- `skipLibCheck: true` for faster builds.
- `forceConsistentCasingInFileNames: true` for cross-platform safety.

---

## 6. vitest.config.ts — Test Config

**File:** `vitest.config.ts`

### Technologies

- Vitest 4.x with global test APIs.

### Architectural Decisions

- **Centralized test runner:** Single root config scans all packages: `packages/*/src/**/*.test.ts` and `packages/*/src/**/*.test.tsx`.
- **Global test APIs:** `globals: true` — no need to import `describe`, `it`, `expect`.
- **Standard exclusions:** `node_modules`, `dist`, `.next`.
- **No separate test configs per package:** All unit/integration tests run from the root — keeps CI simple.

### Conventions

- Test files co-located with source in `__tests__/` directories or alongside source files with `.test.ts` suffix.

---

## 7. eslint.config.js — Root Lint Config

**File:** `eslint.config.js`

### Technologies

- ESLint 10.x with flat config format (ESM).
- `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser`.

### Architectural Decisions

- **Flat config (new ESLint format):** Uses the array-based `export default [...]` flat config, not legacy `.eslintrc`.
- **TypeScript-first:** Only TS/TSX files get TypeScript rules applied.
- **Strict any prohibition:** `@typescript-eslint/no-explicit-any: 'error'` — no `any` types allowed.
- **Underscore pattern for unused args:** `argsIgnorePattern: '^_'` — params prefixed with `_` are allowed unused.
- **Ignore generated/build output:** `.next`, `dist`, `coverage`, `node_modules`, and config files are excluded.

### Conventions

- `no-undef: 'off'` — disabled because TypeScript handles this.
- The frontend has its own `eslint.config.mjs` (extending `eslint-config-next`) for Next.js-specific rules.

---

## 8. playwright.config.ts — E2E Test Config

**File:** `playwright.config.ts`

### Technologies

- Playwright ^1.58.2 with Chromium.

### Architectural Decisions

- **Frontend-only E2E:** Test directory is `packages/frontend/e2e/`, targeting the Next.js UI.
- **Auto-start dev server:** `webServer` config launches the frontend dev server before tests.
- **CI-aware configuration:**
  - `forbidOnly: true` in CI — prevents `.only()` from passing in pipelines.
  - `retries: 2` in CI, `0` locally.
  - `workers: 1` in CI (serialized for stability), unlimited locally.
  - `reuseExistingServer: true` locally — tests can reuse a running dev server.
- **Single browser project:** Only Desktop Chrome — no cross-browser testing.
- **Trace on first retry:** `trace: 'on-first-retry'` for failure debugging.

### Conventions

- `list` reporter (minimal output).
- 120-second timeout for dev server startup.
- Base URL: `http://127.0.0.1:3000`.

---

## 9. CI Pipeline — .github/workflows/ci.yml

**File:** `.github/workflows/ci.yml`

### Technologies

- GitHub Actions on `ubuntu-latest`.
- `pnpm/action-setup@v4` for pnpm installation.
- `actions/setup-node@v4` with pnpm caching.

### Architectural Decisions

- **Five-gate CI:** lint → format check → typecheck → test → build. All must pass.
- **Triggers:** Push to `main` and PRs targeting `main`.
- **Frozen lockfile:** `pnpm install --frozen-lockfile` — no lockfile changes in CI.
- **No E2E in CI:** Only `pnpm test` (Vitest unit tests), not `pnpm test:e2e` (Playwright). E2E tests likely require running services (database, backend) which aren't set up in CI.
- **No database services:** CI doesn't start PostgreSQL, so only unit/integration tests that mock the DB can run.

### Conventions

- Single job — all steps sequential in one runner.
- Node 20 pinned.

---

## 10. Package-Level Details

### Backend (`packages/backend`)

**Key dependencies:**
- Fastify 5.x (HTTP framework)
- `@fastify/cors` (CORS middleware)
- `@fastify/websocket` 11.x (WebSocket support)
- Prisma 7.x (`@prisma/client`, `@prisma/adapter-pg`)
- `openai` SDK 6.x (Azure OpenAI API)
- `dotenv` (env loading)
- `tsx` (dev runner with `tsx watch`)

**Architectural notes:**
- Uses `prisma.config.ts` (Prisma 7 config file) with a custom `loadBackendEnv()` function that loads root `.env` first, then optionally overrides with `packages/backend/.env`.
- Prisma client is generated to `src/generated/prisma/` (in-tree generated code).
- Dev mode: `tsx watch src/server.ts` — auto-restart on changes.
- Production: `tsc` build → `node dist/server.js`.
- Server exports `buildApp()` for testing; conditional `start()` gated by `NODE_ENV !== 'test'`.

### Frontend (`packages/frontend`)

**Key dependencies:**
- Next.js 16.1.6, React 19.2.3
- `@monaco-editor/react` (code editor)
- `@scelar/nodepod` (in-browser code execution sandbox)
- `microsoft-cognitiveservices-speech-sdk` (Azure Speech browser SDK)
- Zustand 5.x (state management)
- Tailwind CSS 4.x

**Architectural notes:**
- Uses App Router (Next.js `src/app/` layout).
- Two pages: dashboard (question selection), interview (`[questionId]` dynamic route).
- Path alias `@/*` mapped to `./src/*`.
- Own TypeScript config with `moduleResolution: "bundler"` (separate from root Node16 resolution).

### Shared (`packages/shared`)

- Pure TypeScript interfaces and constants (no runtime dependencies).
- Exports via `dist/index.js` with type declarations.
- Consumed by both backend and frontend via `workspace:*` dependency.

---

## 11. Environment Variable Strategy

**File:** `.env.example`

- Single root `.env` is the primary config source for local development.
- Backend env loader (`src/lib/env.ts`) loads root `.env` first, then `packages/backend/.env` as override.
- Frontend uses `NEXT_PUBLIC_*` prefix convention for browser-safe variables.
- Azure services configured via:
  - `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` / `AZURE_SPEECH_ENDPOINT` — Speech SDK tokens
  - `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_API_VERSION` — LLM
  - Optional separate TTS resource credentials
- Database URL defaults to Docker Compose PostgreSQL.

---

## 12. Prisma Schema Summary

**Models:** Question, StarterCode, TestCase, InterviewSession, SessionMessage  
**Enums:** Difficulty (easy/medium/hard), SessionStatus (active/completed/abandoned), MessageRole (user/assistant/system), MessageType (code/speech/feedback/system)

**Notable patterns:**
- CUID IDs (`@default(cuid())`) across all models.
- Cascade deletes on child relations (TestCase, StarterCode, SessionMessage).
- Multi-language starter code per question with `@@unique([questionId, language])`.
- Text columns for long content (`@db.Text`).
- 4 migrations tracking schema evolution: init → drop clerk_id → drop user model → add starter code per language. This shows an auth system (Clerk) was removed in favor of anonymous sessions.

---

## Key Discoveries

1. **No authentication:** Clerk was integrated and then removed (migrations show `drop_clerk_id` and `drop_user_model`). Sessions are anonymous.
2. **Browser-native code execution:** NodePod runs code in-browser, avoiding server-side sandboxing complexity.
3. **Browser-native STT:** Azure Speech SDK runs in the browser using tokens issued by the backend — audio never leaves the client.
4. **Server-side TTS:** The backend has a TTS service generating audio on the server using Azure OpenAI TTS.
5. **Prisma 7 with config file:** Uses the newer `prisma.config.ts` pattern instead of the legacy `prisma/schema.prisma` datasource URL approach.
6. **Clean separation of concerns:** Shared types package prevents drift between frontend and backend DTOs.
7. **No containerized app deployment:** Only PostgreSQL is Dockerized. No Dockerfiles for backend/frontend — deployment strategy not yet defined.

---

## Areas Requiring Further Investigation

- [ ] **Deployment strategy:** No Dockerfiles for app services, no cloud deployment config (e.g., Azure App Service, Container Apps). How is this deployed to production?
- [ ] **E2E test coverage:** Playwright config exists but E2E isn't run in CI. What tests exist and why are they excluded from CI?
- [ ] **WebSocket protocol details:** The `ws.ts` route handles real-time interview flow — worth documenting the message protocol.
- [ ] **NodePod execution model:** How code execution sandboxing works in the browser, security boundaries.
- [ ] **Frontend route structure:** Dashboard and interview pages — routing patterns and data fetching strategy.
- [ ] **Backend test mocking strategy:** How DB-dependent tests are handled without a test database in CI.
- [ ] **TTS integration path:** Whether TTS audio is streamed over WebSocket or fetched via REST.
- [ ] **Missing `.gitignore` analysis:** Verify what's excluded from version control.

---

## References

- `README.md` — primary project documentation
- `package.json` — root monorepo config
- `docker-compose.yml` — PostgreSQL service definition
- `pnpm-workspace.yaml` — workspace package discovery
- `tsconfig.json` — root TypeScript project references
- `vitest.config.ts` — centralized unit test config
- `eslint.config.js` — root lint rules (flat config)
- `playwright.config.ts` — E2E test config
- `.github/workflows/ci.yml` — CI pipeline
- `.env.example` — environment variable template
- `packages/backend/package.json` — backend dependencies
- `packages/frontend/package.json` — frontend dependencies
- `packages/shared/package.json` — shared types package
- `packages/backend/prisma.config.ts` — Prisma 7 config
- `packages/backend/prisma/schema.prisma` — database schema
- `packages/backend/src/lib/env.ts` — env loading strategy
- `packages/backend/src/server.ts` — Fastify server entry
- `packages/shared/src/index.ts` — shared type definitions

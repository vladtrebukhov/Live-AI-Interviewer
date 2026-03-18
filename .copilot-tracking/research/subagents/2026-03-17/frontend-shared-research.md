# Frontend & Shared Package Architecture Research

## Research Topics

- Frontend framework and rendering strategy (SSR, SSG, CSR)
- UI component library and styling approach
- State management approach
- Code execution sandboxing model (NodePod)
- API client patterns
- WebSocket integration patterns
- Speech recognition integration
- Shared type contracts between frontend and backend
- Testing patterns for frontend (unit + E2E)
- Route structure and navigation

---

## 1. Frontend Framework & Rendering Strategy

### Framework

- **Next.js 16.1.6** with React 19.2.3 and React DOM 19.2.3.
- TypeScript-first project (`tsconfig.json` extends bundler module resolution, includes `next` plugin).
- App Router (directory-based routing under `src/app/`).

### Rendering Strategy

| Route | Rendering | Evidence |
|---|---|---|
| `/` (Home page) | **Server Component (SSR)** | No `'use client'` directive; pure JSX with `next/link`. Statically renderable at build time (SSG-eligible). |
| `/dashboard` | **Client Component (CSR)** | `'use client'` directive; uses `useState`, `useEffect`, `useRouter` for runtime data fetching via `apiFetch`. |
| `/interview/[questionId]` | **Client Component (CSR)** | `'use client'` directive; heavy client-side logic: Monaco editor, WebSocket, speech recognition, code execution. Uses React 19 `use()` for async params unwrapping. |

### Next.js Configuration (`next.config.ts`)

- Loads env from workspace root using `@next/env` `loadEnvConfig()`.
- Exposes `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_SPEECH_LOCALE` to browser.
- Sets **COOP/COEP headers** (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: credentialless`) on all routes — required for `SharedArrayBuffer` used by the NodePod WASM runtime.

---

## 2. UI Component Library & Styling

### Styling Stack

- **Tailwind CSS v4** via PostCSS (`@tailwindcss/postcss` plugin in `postcss.config.mjs`).
- No component library (shadcn/ui, Radix, MUI, etc.) — all UI is hand-crafted with Tailwind utility classes.
- CSS file: `globals.css` imports `@import "tailwindcss"`, defines CSS custom properties for background/foreground with dark mode `prefers-color-scheme` media query.
- Fonts: **Geist** (sans) and **Geist Mono** loaded via `next/font/google` with CSS variable strategy (`--font-geist-sans`, `--font-geist-mono`).

### UI Patterns

- No shared component library (no `components/` directory).
- Pages are monolithic — the interview page (~400 lines) embeds header, editor, problem panel, feedback panel, test results panel, and console output all in one file.
- Monaco Editor via `@monaco-editor/react` for the code editor.
- No modal/dialog components observed.

---

## 3. State Management

### Primary: Zustand v5

- Single global store: `useInterviewStore` in `packages/frontend/src/stores/interview-store.ts`.
- Created with `create<InterviewState>()` (no middleware — no persist, devtools, or immer).
- Flat state shape, no nested selectors or slices.

### Store Shape

```typescript
interface InterviewState {
  questionId: string | null;
  sessionId: string | null;
  code: string;
  isConnected: boolean;
  isMicOn: boolean;                  // DERIVED from speechStatus
  speechStatus: SpeechRecognitionStatus;
  partialTranscript: string;
  speechError: string | null;
  messages: Array<{ id, role, content, type, createdAt }>;
  testResults: Array<{ testCaseId, passed, actualOutput, expectedOutput, error }>;
  runOutput: string;
  language: SupportedLanguage;       // defaults to 'typescript'
  // ... setters, addMessage, reset
}
```

### Key Design Decisions

- `isMicOn` is derived from `speechStatus` in the `setSpeechStatus` setter (not computed).
- `addMessage` appends to array; `setMessages` replaces entire array (used on session restore).
- `reset()` restores all fields to `initialState` (language defaults to `'typescript'`).
- Store is accessed both reactively (via hook) and imperatively (`useInterviewStore.getState()`) in callbacks and effects.

### Secondary State

- Local `useState` for page-level concerns: `question`, `loading`, `isRunningCode`, `isRunningTests` in the interview page.
- No React Context providers anywhere. No context-based state management.

---

## 4. Code Execution Sandboxing Model (NodePod)

### Architecture

- **In-browser code execution** using `@scelar/nodepod` (WASM-based Node.js runtime).
- Code runs entirely client-side — no server round-trip for execution.
- Requires SharedArrayBuffer → COOP/COEP headers set in `next.config.ts`.

### Implementation (`nodepod-runner.ts`)

- **Singleton runtime**: `Nodepod.boot()` is called once and cached in a module-level `runtimePromise`, reused across all executions. If boot fails, the cached promise is cleared so retries can succeed.
- **Supported languages**: Only `javascript` and `typescript` (validated by `ALLOWED_LANGUAGES` set).
- **TypeScript transpilation**: Uses the `typescript` compiler (`ts.transpileModule`) to transpile TS → JS **in-browser** before execution. Targets ES2020, CommonJS modules, `strict: false`.
- **Execution flow**:
  1. Wrap user code with stdin shim (`createWrappedCode`): intercepts `fs.readFileSync('/dev/stdin')` or file descriptor 0 to return provided input.
  2. For TypeScript: transpile to JS first; bail with error on diagnostics.
  3. Write to virtual filesystem `/main.js`.
  4. Spawn `node /main.js` in the WASM runtime.
  5. Race process completion against a 10-second timeout.
  6. On timeout: attempt `kill()` or `terminate()` on the process (best-effort).

### Test Runner (`run-tests.ts`)

- `runTestCasesInBrowser(language, code, testCases)` runs each test case **sequentially** (not parallel).
- Each test calls `executeInBrowser(language, code, testCase.input)`.
- Pass criteria: `stdout.trim() === expectedOutput.trim() AND !timedOut AND stderr.length === 0 AND exitCode === 0`.
- Errors captured per test case: timeout message, stderr content, or exit code message.
- Exceptions from NodePod (e.g., runtime unavailable) are caught and reported per test case.

---

## 5. API Client Patterns

### Module: `packages/frontend/src/lib/api.ts`

- Base URL from `NEXT_PUBLIC_API_URL` env var (defaults to `http://localhost:3001`).
- Generic `apiFetch<T>(path, options)` wrapper around native `fetch()`:
  - Prepends base URL.
  - Sets `Content-Type: application/json` header by default.
  - On non-OK response: extracts error message from JSON body, throws `Error`.
  - Returns typed JSON response.

### Specific API Functions

| Function | Method | Endpoint | Purpose |
|---|---|---|---|
| `apiFetch<Question[]>('/api/questions')` | GET | `/api/questions` | List all questions for dashboard |
| `apiFetch<Question>('/api/questions/:id')` | GET | `/api/questions/:id` | Fetch single question with test cases & starter codes |
| `createInterviewSession(questionId)` | POST | `/api/sessions` | Create new interview session |
| `fetchInterviewSession(sessionId)` | GET | `/api/sessions/:id` | Restore existing session (with messages) |
| `fetchSpeechToken(payload)` | POST | `/api/speech/token` | Get Azure Speech auth token |

### Session Restore Pattern

- On interview page load: checks if store already has a `sessionId` for the current `questionId`.
- If yes: attempts `fetchInterviewSession(existingSessionId)` with `.catch(() => createInterviewSession(questionId))` fallback.
- If no: creates a new session.
- Restores code and messages from session response.

---

## 6. WebSocket Integration

### Module: `packages/frontend/src/hooks/use-interview-socket.ts`

- Custom hook `useInterviewSocket(questionId, sessionId)` manages a single WebSocket connection.
- **Connection URL**: `${NEXT_PUBLIC_WS_URL}/api/ws?questionId=...&sessionId=...` (defaults to `ws://localhost:3001`).
- **Lifecycle**:
  - Opens on mount when both `questionId` and `sessionId` are available.
  - On open: sends current code as `code_update` message (rehydration).
  - On close: auto-reconnects after 1 second via `connectionAttempt` state counter.
  - Cleanup on unmount: disposes connection, cancels reconnect timer.

### Message Protocol (from `@agentsgalore/shared`)

**Incoming (client → server) `WsIncoming`:**
- `code_update` — sends current editor code.
- `transcript_final` — sends recognized speech with timing and current code snapshot.
- `speech_status` — sends mic status changes.
- `request_feedback` — requests AI feedback (optionally with TTS audio).

**Outgoing (server → client) `WsOutgoing`:**
- `feedback` — AI feedback message with `feedbackType`.
- `transcript` — Echo of user speech.
- `audio` — Base64-encoded audio (OGG) for TTS playback.
- `error` — Error message.

### Audio Playback

- `playAudio(base64Data)` decodes base64 → `Uint8Array` → `Blob` (`audio/ogg`) → `URL.createObjectURL` → `new Audio(url).play()`.
- Object URL revoked on audio end.

### Code Update Debouncing

- Handled in the interview page (not the hook): 1-second debounce via `setTimeout`/`clearTimeout` refs before calling `sendCodeUpdate`.

---

## 7. Speech Recognition Integration

### Module: `packages/frontend/src/hooks/use-azure-speech-recognition.ts`

- Uses **Azure Cognitive Services Speech SDK** (`microsoft-cognitiveservices-speech-sdk` v1.48.0).
- Custom hook `useAzureSpeechRecognition(options)` returns `{ status, partialTranscript, error, isSupported, startRecognition, stopRecognition }`.

### Token Management

- Fetches tokens from backend via `fetchSpeechToken()` (POST `/api/speech/token`).
- Supports two config modes:
  - `SpeechConfig.fromEndpoint()` — if endpoint URL contains `/speech/` path and is NOT a `*.api.cognitive.microsoft.com` host.
  - `SpeechConfig.fromAuthorizationToken()` — fallback with region.
- **Auto-refresh**: Schedules token refresh `max(expiresInSeconds - 60, 60)` seconds before expiry.
- On refresh failure: sets error state, disposes recognizer.

### Recognition Lifecycle

- `startRecognition()`:
  - Validates browser support (`navigator.mediaDevices.getUserMedia`).
  - Validates `questionId/sessionId` availability.
  - Fetches token → creates `SpeechConfig` → creates `AudioConfig` (default microphone) → creates `SpeechRecognizer`.
  - Starts continuous recognition via `startContinuousRecognitionAsync`.
  - Events: `sessionStarted` → `listening`, `recognizing` → partial transcript, `recognized` → final transcript with timing, `canceled` → error, `sessionStopped` → cleanup.

- `stopRecognition()`:
  - Calls `stopContinuousRecognitionAsync`.
  - Disposes recognizer and clears refresh timer.

### Status State Machine

`idle` → `starting` → `listening` → `stopping` → `idle`
                                   ↘ `error`

- `isMicOn` is truthy for `starting`, `listening`, `stopping`.

### Timing Data

- Extracts `offset` and `duration` from Azure SDK results.
- Converts from 100-nanosecond ticks to milliseconds (`/ 10_000`).
- Sent to backend with final transcripts.

---

## 8. Shared Type Contracts (`@agentsgalore/shared`)

### Package Structure

- Project: `@agentsgalore/shared`, version `0.0.1`.
- ESM module (`"type": "module"`).
- Built with `tsc` → `dist/`.
- Consumed as `workspace:*` dependency.

### Core Domain Types

| Type | Fields | Purpose |
|---|---|---|
| `Question` | id, title, description, difficulty, tags, starterCodes, testCases | Interview question definition |
| `StarterCode` | id, language (`SupportedLanguage`), code | Per-language starter code template |
| `TestCase` | id, questionId, input, expectedOutput, isHidden | Test case for validation |
| `InterviewSession` | id, questionId, code, status, startedAt, endedAt | Session lifecycle tracking |
| `SessionMessage` | id, sessionId, role, content, messageType, createdAt | Chat/feedback message |
| `LLMFeedbackRequest` | questionId, questionContext, currentCode, recentTranscript, conversationHistory | AI feedback request payload |
| `LLMFeedbackResponse` | content, type (clarification/hint/feedback/confirmation/follow-up) | AI feedback response |
| `SupportedLanguage` | `'typescript' \| 'javascript'` | Language union type |
| `SUPPORTED_LANGUAGES` | Array `[{ id, label, monacoId }]` | Runtime language registry |
| `CodeExecutionRequest` | language, code, input | Code execution input |
| `CodeExecutionResult` | stdout, stderr, exitCode, timedOut | Code execution output |
| `TestCaseResult` | testCaseId, passed, actualOutput, expectedOutput, error | Test result |
| `SpeechRecognitionTiming` | offset?, duration?, offsetMs?, durationMs? | Speech timing metadata |
| `WsSpeechStatus` | `'idle' \| 'starting' \| 'listening' \| 'stopping' \| 'error'` | WebSocket speech status |
| `WsIncoming` | Discriminated union: code_update, transcript_final, speech_status, request_feedback | Client → server WS messages |
| `WsOutgoing` | Discriminated union: transcript, feedback, error, audio | Server → client WS messages |

### Contract Role

- Shared package is the **single source of truth** for all domain types and WebSocket message schemas.
- Frontend imports: `Question`, `SupportedLanguage`, `SUPPORTED_LANGUAGES`, `TestCase`, `TestCaseResult`, `SpeechRecognitionTiming`, `WsIncoming`, `WsOutgoing`, `WsSpeechStatus`.
- Backend imports the same types (verified by cross-package workspace dependency).

---

## 9. Testing Patterns

### Unit Testing

- **Framework**: Vitest (configured at workspace root `vitest.config.ts`).
- **Glob**: `packages/*/src/**/*.test.ts` and `*.test.tsx`.

#### Store Tests (`interview-store.test.ts`)

- 8 tests covering all store actions and state transitions.
- Pattern: Access store imperatively via `useInterviewStore.getState()`, call actions, assert state.
- `beforeEach`: calls `reset()` for isolation.
- Tests specific derived state (e.g., `isMicOn` derived from `speechStatus`).

#### NodePod Runner Tests (`nodepod-runner.test.ts`)

- 6 tests covering:
  - Unsupported language rejection.
  - JavaScript execution with stdin input.
  - Runtime singleton reuse (boot called once).
  - TypeScript transpilation (type annotations removed).
  - Timeout handling with fake timers.
  - Boot failure recovery (cache invalidation and retry).
- Pattern: `vi.hoisted()` + `vi.mock()` for `@scelar/nodepod`, `vi.resetModules()` + dynamic `import()` per test for module-level singleton isolation.
- Uses `vi.useFakeTimers()` for timeout tests.

#### Test Runner Tests (`run-tests.test.ts`)

- 5 tests covering:
  - Pass/fail based on stdout vs expected output.
  - Stderr surfaced as error.
  - Timeout message propagation.
  - Non-zero exit code with matching output.
  - Execution exception handling.
- Pattern: Mocks `executeInBrowser` via `vi.mock()`, tests `runTestCasesInBrowser` in isolation.

#### Shared Types Tests (`types.test.ts`)

- 5 smoke tests verifying type interfaces compile correctly.
- Creates instances of `Question`, `InterviewSession`, `SessionMessage`, `CodeExecutionRequest/Result`, `TestCaseResult`.
- Validates structural correctness; no runtime behavior tested.

### E2E Testing

- **Framework**: Playwright (configured at `playwright.config.ts`).
- **Test directory**: `packages/frontend/e2e/`.
- **Browser**: Chromium only.
- **Web server**: Playwright auto-starts Next.js dev server on port 3000.
- **Base URL**: `http://127.0.0.1:3000`.
- **CI config**: retries=2, workers=1, forbidOnly=true.

#### Test Coverage (`initial-flow.spec.ts`)

Single test: "initial user flow: home to dashboard to interview page"

1. **Mocks API routes** using `page.route()`:
   - `**/api/questions` → returns fixture question list.
   - `**/api/questions/q-1` → returns single question with starter codes and test cases.
2. **Navigates**: Home → clicks "Get Started" → Dashboard (verifies URL, heading).
3. **Selects question**: Clicks "Design a Parking Lot" → Interview page (verifies URL, heading, Problem Description, Language selector).
4. **Does not mock** WebSocket or session APIs (graceful degradation expected).

---

## 10. Route Structure & Navigation

### Routes

| Path | Component | Type |
|---|---|---|
| `/` | `page.tsx` (Home) | Server Component — landing page with CTA |
| `/dashboard` | `dashboard/page.tsx` | Client Component — question selection grid |
| `/interview/[questionId]` | `interview/[questionId]/page.tsx` | Client Component — full interview workspace |

### Navigation Patterns

- Home → Dashboard: `<Link>` component (client-side navigation).
- Dashboard → Interview: `router.push()` (imperative navigation on card click).
- No back navigation implemented. No breadcrumbs. No sidebar/nav shell.
- `RootLayout` is minimal: font setup, `globals.css`, no providers or nav chrome.

---

## 11. Dependencies Summary

### Production Dependencies

| Package | Version | Purpose |
|---|---|---|
| `next` | 16.1.6 | React framework |
| `react` / `react-dom` | 19.2.3 | UI library |
| `zustand` | ^5.0.11 | State management |
| `@monaco-editor/react` | ^4.7.0 | Code editor |
| `@scelar/nodepod` | ^1.0.6 | In-browser Node.js WASM runtime |
| `microsoft-cognitiveservices-speech-sdk` | ^1.48.0 | Azure Speech recognition |
| `@agentsgalore/shared` | workspace:* | Shared types and constants |

### Dev Dependencies

| Package | Version | Purpose |
|---|---|---|
| `tailwindcss` | ^4 | CSS utility framework |
| `@tailwindcss/postcss` | ^4 | PostCSS integration |
| `eslint` / `eslint-config-next` | ^9 / 16.1.6 | Linting |
| `typescript` | ^5 | Type checking |

---

## 12. Key Architectural Decisions

1. **No component library** — all UI is utility-first Tailwind. No design system.
2. **Client-side code execution** — NodePod WASM runtime avoids server-side execution complexity; requires COOP/COEP headers.
3. **Zustand over Context** — flat global store, no provider wrappers, imperative access outside components.
4. **Azure Speech SDK** — continuous recognition with token-based auth and auto-refresh; not Web Speech API.
5. **WebSocket for real-time** — bidirectional communication for code updates, speech transcripts, AI feedback, and TTS audio.
6. **Shared package as contract** — all domain types and WS message schemas in one package consumed by both frontend and backend.
7. **Sequential test execution** — test cases run sequentially (not parallel) in the NodePod runtime.
8. **Monolithic page components** — interview page is ~400 lines with no sub-component extraction.

---

## 13. Discovered Research Threads (Completed)

- [x] How does the frontend handle session resumption? — Via `fetchInterviewSession` with fallback to `createInterviewSession`.
- [x] How are COOP/COEP headers configured? — Via `next.config.ts` `headers()` on all routes.
- [x] What is the TypeScript transpilation strategy? — In-browser `ts.transpileModule` targeting ES2020/CommonJS.
- [x] How does token refresh work? — Timer-based refresh 60 seconds before expiry with error recovery.
- [x] How is stdin simulated? — Monkey-patches `fs.readFileSync` for fd 0 and `/dev/stdin`.

## 14. Outstanding Clarifying Questions

- None. All provided topics were fully researched through code analysis.

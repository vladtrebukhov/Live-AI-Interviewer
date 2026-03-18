<!-- markdownlint-disable-file -->
# Implementation Details: Azure Speech STT Endpoint

## Context Reference

Sources: `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md`, `.copilot-tracking/research/subagents/2026-03-10/azure-speech-sdk-continuous-stt-research.md`, `.copilot-tracking/research/subagents/2026-03-10/repo-audio-realtime-integration-research.md`, `.copilot-tracking/research/subagents/2026-03-10/future-voice-loop-constraints-research.md`

## Implementation Phase 1: Backend Speech token broker and configuration

<!-- parallelizable: true -->

### Step 1.1: Add Azure Speech configuration contract and backend route scaffold

Define the backend-only configuration required for Azure Speech authentication and add the route entry point that will broker short-lived Speech tokens to the frontend. The implementation should establish a stable response shape for the frontend hook before browser integration begins.

Files:
* `.env.example` - Add `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, optional `AZURE_SPEECH_ENDPOINT`, and any frontend-safe locale variable.
* `packages/backend/.env.example` - Mirror backend-only Speech variables for local package setup.
* `packages/backend/src/routes/speech.ts` - Create a Fastify route module for Speech token issuance.
* `packages/backend/src/server.ts` - Register the new Speech route alongside existing REST routes.

Discrepancy references:
* None. This step reflects the selected implementation path and does not depend on an open discrepancy.

Success criteria:
* Backend env examples document the minimum Speech variables needed for local development.
* The backend exposes a dedicated route module for Speech token issuance.
* The endpoint response contract is stable enough for parallel frontend development.
* The route design explicitly reserves room for caller verification and abuse controls.

Context references:
* `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md` - Selected approach and actionable next steps.
* `packages/backend/src/server.ts` - Existing route registration pattern.
* `.env.example` - Current Azure OpenAI-only configuration pattern.

Dependencies:
* Azure Speech resource provisioned with key and region or endpoint.
* Existing Fastify server bootstrap remains unchanged.

### Step 1.2: Implement secure token issuance, validation, and failure handling

Implement the token broker route so the frontend can fetch short-lived Speech auth material without exposing the Speech key. Include consistent error handling for missing configuration, upstream token exchange failures, and malformed requests. Protect the route with the strongest existing application boundary available. If the app already has user authentication, reuse it. If it does not, add anonymous abuse controls such as rate limiting, origin validation, and session-bound checks so `/api/speech/token` cannot be freely abused.

Files:
* `packages/backend/src/routes/speech.ts` - Exchange backend-held credentials for short-lived Speech auth material and return token metadata.
* `packages/backend/src/server.ts` - Ensure the route is mounted with the expected `/api/speech` prefix.

Discrepancy references:
* None. This step reflects the selected implementation path and does not depend on an open discrepancy.

Success criteria:
* The endpoint returns short-lived auth data in the agreed shape for frontend consumption.
* Error responses are explicit for missing env vars and Azure token acquisition failures.
* The route keeps long-lived Speech credentials backend-only.
* The route enforces caller authentication or equivalent abuse controls appropriate to the current app boundary.

Context references:
* `.copilot-tracking/research/subagents/2026-03-10/azure-speech-sdk-continuous-stt-research.md` - Token lifetime and browser token guidance.
* `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md` - Preferred backend endpoint shape.

Dependencies:
* Step 1.1 completion.
* Availability of the Azure Speech authentication endpoint.

### Step 1.3: Validate backend token broker changes

Run backend-scoped validation after the route and configuration changes land.

Validation commands:
* `pnpm --filter @agentsgalore/backend build` - Verify backend TypeScript compiles with the new route.
* `pnpm lint` - Catch workspace-level lint regressions introduced by backend file changes.

## Implementation Phase 2: Frontend Speech SDK hook and recognition state

<!-- parallelizable: true -->

### Step 2.1: Add browser Speech SDK integration and recognizer lifecycle hook

Add the browser-side Azure Speech SDK dependency and create a dedicated hook that manages microphone recognition lifecycle. The hook should fetch auth tokens from the backend, start and stop continuous recognition, emit partial and final transcript callbacks, refresh tokens during long sessions, and expose cancellation or permission errors.

Files:
* `packages/frontend/package.json` - Add `microsoft-cognitiveservices-speech-sdk` to frontend dependencies.
* `pnpm-lock.yaml` - Capture dependency updates.
* `packages/frontend/src/hooks/use-azure-speech-recognition.ts` - Create the recognizer hook.
* `packages/frontend/src/lib/api.ts` - Add typed API support for Speech token retrieval if needed.

Discrepancy references:
* None. This step executes the selected browser-recognition path documented in the planning log.

Success criteria:
* The frontend has a dedicated hook for Speech recognizer lifecycle instead of reusing `MediaRecorder` chunk uploads.
* The hook exposes partial text, final text, listening status, and error states.
* Token refresh behavior is accounted for so long-running interviews do not silently expire.

Context references:
* `.copilot-tracking/research/subagents/2026-03-10/azure-speech-sdk-continuous-stt-research.md` - Recognizer lifecycle, auth token refresh, and browser SDK support.
* `packages/frontend/src/lib/api.ts` - Existing API helper for backend calls.
* `packages/frontend/src/hooks/use-audio-capture.ts` - Current mic capture implementation to replace or retire from the primary flow.

Dependencies:
* Stable token response contract from Implementation Phase 1.
* Browser support for microphone access.

### Step 2.2: Integrate recognition state into interview UI and client store

Wire the new Speech hook into the interview page and Zustand store so the UI can represent listening status, partial transcript preview, final transcript handoff, and session-bound speech errors. This phase should also remove the assumption that toggling the mic always means recording started successfully.

Files:
* `packages/frontend/src/stores/interview-store.ts` - Add fields for `sessionId`, speech status, partial transcript text, and Speech error state.
* `packages/frontend/src/app/interview/[questionId]/page.tsx` - Replace direct `useAudioCapture` wiring with Speech recognizer lifecycle and explicit async mic state transitions.
* `packages/frontend/src/hooks/use-audio-capture.ts` - Retire, narrow, or preserve as a fallback-only utility depending on implementation choice.

Discrepancy references:
* None. This step applies the selected frontend integration approach and does not resolve a currently open discrepancy.

Success criteria:
* Mic state reflects actual recognizer start and stop outcomes.
* Partial transcripts can be rendered locally without polluting durable conversation history.
* Final transcript callbacks are available for websocket or persistence handoff.

Context references:
* `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md` - Preferred transcript event model.
* `packages/frontend/src/stores/interview-store.ts` - Existing interview state shape.
* `packages/frontend/src/app/interview/[questionId]/page.tsx` - Current mic toggle and interview initialization flow.

Dependencies:
* Step 2.1 completion.
* UI decision on whether partial transcripts should be visibly rendered.

### Step 2.3: Validate frontend Speech integration changes

Run frontend-scoped validation if the shared contract work in Phase 3 is not concurrently modifying the same type surfaces. Otherwise, defer final validation to the last phase.

Validation commands:
* `pnpm --filter @agentsgalore/frontend lint` - Verify frontend linting.
* `pnpm --filter @agentsgalore/frontend build` - Verify Next.js compilation once shared types are stable.

## Implementation Phase 3: Realtime contract, session bootstrap, and transcript persistence

<!-- parallelizable: false -->

### Step 3.1: Replace raw audio websocket payloads with transcript-oriented events

Update the shared websocket contract and backend websocket handler so the realtime channel carries finalized transcript events, optional speech status events, and feedback requests rather than raw audio chunks. Preserve compatibility with code updates and later TTS playback. Surface optional recognition timing metadata such as offsets and durations on final transcript events so later turn-taking work does not need another protocol redesign.

Files:
* `packages/shared/src/index.ts` - Replace or extend websocket message unions with transcript-oriented event types.
* `packages/backend/src/routes/ws.ts` - Accept final transcript payloads, preserve conversation history, and stop requiring backend audio chunk transcription in the primary path.
* `packages/backend/src/services/stt.ts` - Remove or repurpose Whisper-specific chunk transcription if it is no longer used in the main flow.
* `packages/frontend/src/hooks/use-interview-socket.ts` - Send transcript events rather than base64 audio blobs.

Discrepancy references:
* None. This step reflects the selected implementation path and does not depend on an open discrepancy.

Success criteria:
* The preferred websocket path no longer depends on `audio_chunk` messages.
* Final transcript events can reach the backend alongside the latest code context.
* The websocket contract continues to support feedback and assistant audio responses.
* Final transcript payloads can optionally carry recognition timing metadata needed for future turn-taking heuristics.

Context references:
* `.copilot-tracking/research/subagents/2026-03-10/repo-audio-realtime-integration-research.md` - Current websocket contract and backend STT path.
* `packages/shared/src/index.ts` - Existing websocket message unions.
* `packages/backend/src/routes/ws.ts` - Existing in-memory conversation orchestration.

Dependencies:
* Implementation Phase 1 completion for secure Speech auth.
* Implementation Phase 2 completion for finalized transcript production in the browser.

### Step 3.2: Bind live interviews to persisted sessions and store final utterances

Create or retrieve an interview session before the websocket flow begins, thread `sessionId` through the live interview state, and persist finalized transcript turns into the existing session model. This phase anchors the new Speech-driven interaction model in the repository’s existing data layer.

Files:
* `packages/frontend/src/lib/api.ts` - Add typed helpers for creating or retrieving interview sessions if needed.
* `packages/frontend/src/app/interview/[questionId]/page.tsx` - Bootstrap `sessionId` before or during websocket connection setup.
* `packages/frontend/src/hooks/use-interview-socket.ts` - Include `sessionId` in connection and transcript payloads.
* `packages/backend/src/routes/sessions.ts` - Extend or reuse session endpoints if extra transcript persistence operations are needed.
* `packages/backend/prisma/schema.prisma` - Confirm the current models are sufficient; only modify if persistence requirements exceed existing fields.

Discrepancy references:
* None. This step operationalizes the selected session-backed persistence approach already reflected in the planning log.

Success criteria:
* Live interview flows have a `sessionId` available before transcript persistence occurs.
* Finalized user utterances can be stored as `SessionMessage` records.
* Reconnect logic can recover state from durable data rather than connection-local memory alone.

Context references:
* `.copilot-tracking/research/subagents/2026-03-10/repo-audio-realtime-integration-research.md` - Existing session bypass in the live interview flow.
* `packages/backend/prisma/schema.prisma` - Current `InterviewSession` and `SessionMessage` models.
* `packages/backend/src/routes/sessions.ts` - Existing session REST pattern.

Dependencies:
* Step 3.1 completion.
* Agreement on whether transcript persistence is synchronous with realtime updates or eventual.

## Implementation Phase 4: Validation

<!-- parallelizable: false -->

### Step 4.1: Run full project validation

Execute all validation commands required for the modified frontend, backend, and shared packages.

Validation commands:
* `pnpm lint`
* `pnpm typecheck`
* `pnpm test`
* `pnpm build`

### Step 4.2: Fix minor validation issues

Iterate on lint errors, type errors, and build or test failures caused directly by the Speech integration changes. Apply straightforward corrections inline without expanding scope into additional architecture changes.

### Step 4.3: Report blocking issues

If validation reveals issues that require deeper design work, document the blockers, affected files, and whether they relate to Speech auth, websocket protocol migration, or session persistence. Hand off those issues for follow-up planning rather than broad refactoring inside the validation pass.

## Implementation Phase 5: Review remediation and validation closure

<!-- parallelizable: false -->

### Step 5.1: Add targeted websocket and session persistence tests

Add direct automated coverage for the transcript-oriented websocket flow so reconnect hydration, transcript persistence, feedback persistence, and session mismatch handling are verified by tests rather than by code inspection alone.

Files:
* `packages/backend/src/routes/ws.ts` - Extract minimal test seams if needed for websocket message handling and session hydration.
* `packages/backend/src/routes/__tests__/ws.test.ts` - Add tests covering reconnect restoration, transcript persistence, feedback persistence, and session mismatch rejection.

Discrepancy references:
* None. This step addresses review findings and strengthens validation coverage for already-implemented behavior.

Success criteria:
* The websocket/session migration path has direct automated coverage.
* Tests cover persisted session hydration on connect.
* Tests cover transcript persistence and assistant feedback persistence.
* Tests cover at least one session mismatch failure path.

### Step 5.2: Remove retired raw-audio STT implementation surface

Remove or explicitly retire the old raw-audio STT path now that the preferred flow uses browser Azure Speech recognition and transcript-oriented websocket messages.

Files:
* `packages/backend/src/services/stt.ts` - Remove if unused by source code.
* `packages/frontend/src/hooks/use-audio-capture.ts` - Remove if unused by source code.
* Any references or exports that would otherwise keep these paths alive.

Discrepancy references:
* None. This step addresses review cleanup findings and clarifies the intended architecture.

Success criteria:
* No source code references remain to the deprecated raw-audio path.
* The repository no longer presents two competing STT implementations for the live interview flow.

### Step 5.3: Repair root validation ergonomics and re-run full validation

Address the review findings around root build ergonomics and re-run the full validation pass. If the frontend ESLint crash can be resolved with a small configuration adjustment, include that fix here; otherwise document it cleanly as an external blocker with preserved stderr evidence.

Files:
* `eslint.config.js` - Adjust ignores if needed so root lint does not crash on package config files.
* `package.json` - Fix the root build script ergonomics for Corepack-based environments if needed.
* Any minimal supporting files required to make root validation reliable.

Discrepancy references:
* None. This step addresses review findings and aims to close the remaining open validation step.

Success criteria:
* `corepack pnpm lint` passes or preserves explicit stderr evidence for an external blocker.
* `corepack pnpm build` succeeds in this environment.
* Root validation status can be updated based on direct command output rather than inferred equivalents.

## Dependencies

* Azure Speech resource and credentials
* Browser microphone permissions
* Existing Fastify, Next.js, Prisma, and websocket infrastructure
* `microsoft-cognitiveservices-speech-sdk` frontend dependency

## Success Criteria

* Browser microphone recognition uses Azure Speech continuous recognition rather than backend chunk transcription.
* Speech authentication is brokered securely through the backend without exposing long-lived Speech keys to the client.
* Finalized transcript events can reach the backend and be associated with an interview session.
* The app passes lint, typecheck, tests, and build after the integration work.

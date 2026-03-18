---
title: Azure Speech STT Endpoint Phase 3 validation
description: Validation of Implementation Phase 3 against the plan, changes log, research, and workspace evidence
author: GitHub Copilot
ms.date: 2026-03-11
ms.topic: review
keywords:
  - validation
  - azure speech
  - stt
  - websocket
  - session persistence
estimated_reading_time: 8
---

## Validation status

* Status: Partial.
* Coverage: Functional implementation is mostly present, but phase-specific validation evidence is incomplete.
* Phase verdict: Phase 3 is largely implemented, but it is not fully satisfied because the recorded validation claims overstate how directly the websocket/session migration was verified.

## Scope validated

Phase 3 in the plan is defined at `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/plans/2026-03-10/azure-speech-stt-endpoint-plan.instructions.md:86-92` and expands into the Phase 3 detail sections at `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md:142-184`.

The research requirements most relevant to this phase are:

* Stop sending raw audio chunks through the websocket and keep the websocket as the control plane: `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:266`.
* Send finalized transcripts over realtime while keeping partials client-local: `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:267,315`.
* Thread `sessionId` through the live flow so utterances can be persisted: `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:268`.
* Store only final transcript segments durably: `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:314-315`.
* Preserve offsets and durations for future turn-taking heuristics: `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:108` and `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md:159`.

## Requirement traceability

### Step 3.1 outcome

Result: Implemented with a minor cleanup gap.

Evidence that the websocket contract migrated from raw audio to transcript-oriented events:

* The shared contract now carries `transcript_final`, `speech_status`, and transcript timing metadata in `/Users/vlad/Development/Projects/agentsgalore/packages/shared/src/index.ts:85-100`.
* The frontend websocket hook now refuses to connect until both `questionId` and `sessionId` are available and sends `code_update`, `transcript_final`, `speech_status`, and `request_feedback` with `sessionId` in `/Users/vlad/Development/Projects/agentsgalore/packages/frontend/src/hooks/use-interview-socket.ts:15-24,33,108-123`.
* The backend websocket route accepts `transcript_final`, validates `sessionId` consistency, stores transcript messages, and still supports feedback and audio responses in `/Users/vlad/Development/Projects/agentsgalore/packages/backend/src/routes/ws.ts:128-161,173-229`.

Evidence that timing metadata is preserved on finalized transcript events:

* The recognizer extracts `offset`, `duration`, `offsetMs`, and `durationMs` in `/Users/vlad/Development/Projects/agentsgalore/packages/frontend/src/hooks/use-azure-speech-recognition.ts:41-52`.
* Final transcript callbacks carry that timing payload in `/Users/vlad/Development/Projects/agentsgalore/packages/frontend/src/hooks/use-azure-speech-recognition.ts:211`.
* The shared websocket types and backend transcript echo both preserve the optional `timing` field in `/Users/vlad/Development/Projects/agentsgalore/packages/shared/src/index.ts:95,100` and `/Users/vlad/Development/Projects/agentsgalore/packages/backend/src/routes/ws.ts:161-164`.

Research alignment:

* This matches the research direction to stop sending raw audio over the websocket and send finalized transcript segments instead: `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:266-267`.
* Partial transcript text remains client-local through the speech hook and store callbacks rather than being persisted, which aligns with `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:165,315`.

### Step 3.2 outcome

Result: Implemented.

Evidence that the live interview flow is session-backed before transcript persistence occurs:

* The interview page bootstraps or reuses a persisted session via `fetchInterviewSession` or `createInterviewSession` in `/Users/vlad/Development/Projects/agentsgalore/packages/frontend/src/app/interview/[questionId]/page.tsx:106-110`.
* The fetched session is written into client state via `setSessionId(session.id)` and the persisted message history is loaded into the UI in `/Users/vlad/Development/Projects/agentsgalore/packages/frontend/src/app/interview/[questionId]/page.tsx:116-126`.
* The websocket hook only opens once `sessionId` exists and includes it in the websocket URL and outbound payloads in `/Users/vlad/Development/Projects/agentsgalore/packages/frontend/src/hooks/use-interview-socket.ts:15-24,108-123`.

Evidence that final utterances are stored durably and reconnect state can be rebuilt from storage:

* Existing Prisma models already support session messages without a schema change in `/Users/vlad/Development/Projects/agentsgalore/packages/backend/prisma/schema.prisma:50-73`.
* The session API returns ordered historical messages for bootstrap/reload in `/Users/vlad/Development/Projects/agentsgalore/packages/backend/src/routes/sessions.ts:55-60`.
* The websocket route rehydrates `currentCode` and prior `conversationHistory` from persisted session data on connect in `/Users/vlad/Development/Projects/agentsgalore/packages/backend/src/routes/ws.ts:50,65-66`.
* Final transcript events are persisted as `SessionMessage` rows with `messageType: 'speech'` in `/Users/vlad/Development/Projects/agentsgalore/packages/backend/src/routes/ws.ts:153,159-164`.
* Assistant feedback is also persisted as `messageType: 'feedback'` in `/Users/vlad/Development/Projects/agentsgalore/packages/backend/src/routes/ws.ts:205-219`.

Research alignment:

* This satisfies the research requirement to thread `sessionId` through the live interview flow and store only final transcript segments durably: `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:268,314-315`.

## Findings by severity

### Major

1. Phase 3 validation claims are only partially substantiated by repository evidence.

   The change log claims passed validation at `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md:91`, but the available automated coverage in the workspace does not directly exercise the websocket contract migration, session bootstrap, or transcript persistence path.

   Evidence:

   * The backend test file only covers the health endpoint in `/Users/vlad/Development/Projects/agentsgalore/packages/backend/src/__tests__/server.test.ts:24-31`.
   * The frontend store test only covers local speech-state derivation in `/Users/vlad/Development/Projects/agentsgalore/packages/frontend/src/stores/__tests__/interview-store.test.ts:40-53,100-121`.
   * The frontend e2e test only checks navigation into the interview page in `/Users/vlad/Development/Projects/agentsgalore/packages/frontend/e2e/initial-flow.spec.ts:3-55`.
   * The shared type test is a smoke test, not a protocol-behavior test, in `/Users/vlad/Development/Projects/agentsgalore/packages/shared/src/__tests__/types.test.ts:13-54`.

   Impact:

   * The implementation appears correct by inspection, but the phase is not fully validated as claimed.
   * Regressions in `/Users/vlad/Development/Projects/agentsgalore/packages/backend/src/routes/ws.ts` and `/Users/vlad/Development/Projects/agentsgalore/packages/frontend/src/hooks/use-interview-socket.ts` could slip through without a targeted test catching them.

### Minor

1. The legacy backend chunk-transcription service remains present even though the preferred flow has migrated away from it.

   Evidence:

   * The phase detail for Step 3.1 still listed `packages/backend/src/services/stt.ts` as a remove-or-repurpose candidate at `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/details/2026-03-10/azure-speech-stt-endpoint-details.md:146-149`.
   * The legacy Whisper-style service still exists in `/Users/vlad/Development/Projects/agentsgalore/packages/backend/src/services/stt.ts:9`.
   * No source-file evidence from the Phase 3 flow references that service anymore, while the preferred path runs through `/Users/vlad/Development/Projects/agentsgalore/packages/frontend/src/hooks/use-azure-speech-recognition.ts:211`, `/Users/vlad/Development/Projects/agentsgalore/packages/frontend/src/hooks/use-interview-socket.ts:112-123`, and `/Users/vlad/Development/Projects/agentsgalore/packages/backend/src/routes/ws.ts:128-161`.

   Impact:

   * This does not block Phase 3 behavior, but it leaves stale implementation surface behind and weakens the migration cleanup.

## Changes-log accuracy assessment

* The claim that `/Users/vlad/Development/Projects/agentsgalore/packages/backend/src/routes/ws.ts` now persists transcript and feedback messages is supported by `/Users/vlad/Development/Projects/agentsgalore/packages/backend/src/routes/ws.ts:153,205-219` and matches `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md:33`.
* The same changes-log line is only partially precise about reconnect behavior. The backend does reload persisted code and messages on websocket connect in `/Users/vlad/Development/Projects/agentsgalore/packages/backend/src/routes/ws.ts:50,65-66`, and the page bootstrap reloads messages through `/Users/vlad/Development/Projects/agentsgalore/packages/frontend/src/app/interview/[questionId]/page.tsx:106-126` plus `/Users/vlad/Development/Projects/agentsgalore/packages/backend/src/routes/sessions.ts:55-60`, but there is no dedicated websocket replay event that rehydrates the client UI on reconnect.
* The validation claim in `/Users/vlad/Development/Projects/agentsgalore/.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md:91` is broader than the evidence available in the repository artifacts. The workspace contains implementation and some surrounding tests, but not direct proof that the Phase 3 websocket/session flow itself was validated.

## Coverage assessment

* Step 3.1 checklist coverage: Implemented, with timing metadata preserved and raw-audio websocket payloads removed from the preferred source flow.
* Step 3.2 checklist coverage: Implemented, with session bootstrap, final transcript persistence, feedback persistence, and durable reconnect reconstruction on the backend.
* Validation coverage: Partial, because the implemented code paths lack direct automated tests for the websocket/session migration and the logged validation claims overstate confidence.

Overall coverage for Phase 3 is high for implementation and moderate for validation.

## Clarifying questions

* None at this time.

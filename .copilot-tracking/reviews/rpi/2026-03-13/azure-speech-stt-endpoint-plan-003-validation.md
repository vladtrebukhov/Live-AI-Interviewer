---
title: Phase 3 RPI Validation for Azure Speech STT Endpoint
description: Validation of Phase 3 implementation against the plan, changes log, and research for the Azure Speech STT endpoint work
author: GitHub Copilot
ms.date: 2026-03-13
ms.topic: reference
keywords:
  - validation
  - azure speech
  - speech to text
  - phase 3
  - realtime contract
estimated_reading_time: 6
---

## Validation outcome

| Item         | Value |
|--------------|-------|
| Plan         | `.copilot-tracking/plans/2026-03-10/azure-speech-stt-endpoint-plan.instructions.md` |
| Changes log  | `.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md` |
| Research     | `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md` |
| Phase        | 3 |
| Status       | Passed |
| Phase state  | Complete |
| Coverage     | Complete |

Phase 3 is fully implemented based on the plan requirements, the logged changes, and the verified source evidence. I found no missing implementations, no blocked work, and no deviations from the research guidance for this phase.

## Requirement traceability

| Plan requirement | Logged change | Research requirement | Verified evidence | Assessment |
|------------------|---------------|----------------------|-------------------|------------|
| Step 3.1 replaces raw audio websocket payloads with transcript-oriented events and preserves optional timing metadata. Plan refs: `.copilot-tracking/plans/2026-03-10/azure-speech-stt-endpoint-plan.instructions.md:90-90` | Changes log states the shared contract moved to transcript-oriented events with timing metadata, the frontend websocket hook sends finalized transcript events, and the backend websocket route persists transcript state. Refs: `.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md:31-34` | Research required threading finalized transcript events through the websocket path, preserving timing metadata, and storing only final transcript segments durably. Refs: `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:108-108`, `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:314-314`, `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:328-328` | `packages/shared/src/index.ts:84-100` defines `SpeechRecognitionTiming`, `WsIncoming.transcript_final`, `WsIncoming.speech_status`, and `WsOutgoing.transcript` with timing metadata. `packages/frontend/src/hooks/use-interview-socket.ts:24-24,110-123` binds the websocket to `sessionId`, sends `transcript_final`, and sends `speech_status` and feedback requests. `packages/backend/src/routes/ws.ts:213-258` accepts `transcript_final`, persists the final user speech message, and echoes a `transcript` response with `timing`. | Implemented |
| Step 3.2 binds live interviews to persisted sessions and stores final utterances without requiring a schema migration. Plan refs: `.copilot-tracking/plans/2026-03-10/azure-speech-stt-endpoint-plan.instructions.md:92-94` | Changes log states the live flow is session-backed, the interview page and API gained session helpers, the websocket route restores session state on reconnect, and Phase 3 reused the existing Prisma schema. Refs: `.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md:27-29`, `.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md:34-34`, `.copilot-tracking/changes/2026-03-10/azure-speech-stt-endpoint-changes.md:53-53` | Research required introducing `sessionId` earlier in the flow, threading it through the live interview route, and storing only final transcript segments durably in `SessionMessage`. Refs: `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:268-268`, `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:311-314`, `.copilot-tracking/research/2026-03-10/azure-speech-sdk-stt-endpoint-research.md:391-391` | `packages/frontend/src/lib/api.ts:58-65` adds session create and fetch helpers. `packages/frontend/src/app/interview/[questionId]/page.tsx:106-126` loads or creates a session, hydrates stored messages, and stores `sessionId` before the realtime flow proceeds. `packages/backend/src/routes/ws.ts:135-159` validates and hydrates an existing session on websocket connect, including historical messages and stored code. `packages/backend/src/routes/ws.ts:237-247` persists finalized user utterances as `SessionMessage` rows with `messageType: 'speech'`. `packages/backend/prisma/schema.prisma:50-59,68-73` shows the existing `InterviewSession` and `SessionMessage` models already support this persistence shape without a migration. | Implemented |

## Verification notes

| Check | Evidence | Result |
|-------|----------|--------|
| Reconnect state is restored from persisted session data | `packages/backend/src/routes/__tests__/ws.test.ts:60-60` covers hydration of persisted code and conversation history | Passed |
| Final transcripts are persisted and echoed back with timing metadata | `packages/backend/src/routes/__tests__/ws.test.ts:112-112` covers transcript persistence and outbound echo behavior | Passed |
| Session mismatch protection rejects invalid transcript writes | `packages/backend/src/routes/__tests__/ws.test.ts:214-214` covers session mismatch rejection for `transcript_final` | Passed |
| No raw `audio_chunk` message remains in the preferred websocket contract | `packages/shared/src/index.ts:93-100` enumerates the active websocket message union and contains transcript-oriented events only | Passed |

## Findings by severity

### Critical

No findings.

### Major

No findings.

### Minor

No findings.

## Coverage assessment

Phase 3 coverage is complete.

The implementation satisfies the two planned Phase 3 steps:

* The realtime contract now uses transcript-oriented websocket messages with optional timing metadata.
* The live interview flow now creates or restores a persisted session before realtime transcript persistence.
* Finalized user utterances are stored durably as `SessionMessage` records.
* Existing Prisma models were sufficient, which matches both the plan and the changes log.

I did not find any unlogged Phase 3 source implementation files during the targeted symbol search. The verified source files align with the changes log entries for this phase.

## Clarifying questions

None.

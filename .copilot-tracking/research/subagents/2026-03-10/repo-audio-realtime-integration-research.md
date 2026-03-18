---
title: Repo audio realtime integration research
description: Research findings for Azure Speech-to-Text continuous microphone transcription integration points in the agentsgalore workspace
author: GitHub Copilot
ms.date: 2026-03-10
ms.topic: reference
keywords:
  - azure speech
  - speech to text
  - websocket
  - realtime audio
  - next.js
  - fastify
estimated_reading_time: 8
---

## Research topics

* Analyze the `agentsgalore` workspace for Azure Speech-to-Text continuous microphone transcription integration points
* Focus on frontend audio capture hooks, websocket and session architecture, backend services and routes, current STT and TTS placeholders, env and config patterns, and where an STT endpoint or token endpoint would fit

## Status

* Complete

## Findings

### Current frontend audio flow

* The interview page wires microphone capture directly to the websocket audio sender: `useInterviewSocket(question?.id ?? null)` and `useAudioCapture({ onAudioChunk: sendAudioChunk })` are instantiated together in packages/frontend/src/app/interview/[questionId]/page.tsx:37-49.
* Microphone start and stop is UI-driven only. `handleToggleMic` flips store state immediately after calling `startRecording()` or `stopRecording()`, so the UI can say the mic is on even if browser permission fails in `startRecording()`. See packages/frontend/src/app/interview/[questionId]/page.tsx:41-49 and packages/frontend/src/hooks/use-audio-capture.ts:15-37.
* Audio capture is chunked, not truly continuous recognition. The hook uses `getUserMedia`, `MediaRecorder`, MIME type `audio/webm;codecs=opus`, base64-encodes each blob, and emits a chunk every 3000 ms via `mediaRecorder.start(chunkIntervalMs)`. See packages/frontend/src/hooks/use-audio-capture.ts:15-33.
* This design is suitable for server-side batch transcription of short blobs, but it does not expose partial recognition events, speech-start or speech-end events, or SDK-managed continuous sessions.

### Current websocket and feedback flow

* The websocket connection is keyed only by `questionId`, via `/api/ws?questionId=...`. There is no `sessionId`, reconnect token, or speech auth token in the connection contract. See packages/frontend/src/hooks/use-interview-socket.ts:6-23 and packages/backend/src/routes/ws.ts:36-46.
* The frontend sends three websocket message types only: `code_update`, `audio_chunk`, and `request_feedback`. Shared contract types mirror that minimal protocol in packages/shared/src/index.ts:84-93.
* Transcript messages received from the server are appended into the client message list as user speech messages, and feedback messages are appended as assistant messages. See packages/frontend/src/hooks/use-interview-socket.ts:26-47 and packages/frontend/src/stores/interview-store.ts:48-57.
* The backend websocket route keeps mutable state in memory per connection: `currentCode` and `conversationHistory`. That state is not persisted and will be lost on reconnect or server restart. See packages/backend/src/routes/ws.ts:61-63, 84-98, and 106-152.

### Current backend STT and TTS implementation

* The backend websocket route currently performs STT server-side for every `audio_chunk` by decoding base64 into a `Buffer` and calling `transcribeAudio(audioBuffer)`. See packages/backend/src/routes/ws.ts:88-101.
* `transcribeAudio` is implemented with Azure OpenAI audio transcription, not Azure AI Speech SDK. It wraps the chunk in a `File` and calls `openai.audio.transcriptions.create()` using `AZURE_OPENAI_WHISPER_DEPLOYMENT`. See packages/backend/src/services/stt.ts:1-18.
* `synthesizeSpeech` also uses Azure OpenAI audio APIs, not Azure AI Speech. It requests `response_format: 'opus'` and returns a raw `Buffer`. See packages/backend/src/services/tts.ts:9-18.
* The frontend audio playback helper creates a `Blob` with type `audio/ogg` for incoming assistant audio. That should be validated against the backend `opus` response format before reusing the same path for Azure Speech synthesis. See packages/frontend/src/hooks/use-interview-socket.ts:76-82 and packages/backend/src/services/tts.ts:10-15.
* The LLM feedback path is separate and already structured as a service boundary, which is useful if continuous STT later feeds finalized utterances into the same `request_feedback` flow. See packages/backend/src/routes/ws.ts:106-141 and packages/backend/src/services/llm.ts:1-64.

### Session architecture and persistence gaps

* The data model already supports persisted interview sessions and persisted session messages. `InterviewSession` and `SessionMessage` are defined in packages/backend/prisma/schema.prisma:50-77.
* REST endpoints exist to create, list, fetch, and patch sessions in packages/backend/src/routes/sessions.ts:5-102.
* The backend registers those routes at `/api/sessions` in packages/backend/src/server.ts:23-28.
* The frontend currently does not create or use sessions when entering an interview. The dashboard fetches questions and navigates directly to `/interview/${q.id}` in packages/frontend/src/app/dashboard/page.tsx:14-23 and 40-50, while the interview page fetches the question directly from `/api/questions/:id` in packages/frontend/src/app/interview/[questionId]/page.tsx:51-67.
* Result: the schema and REST layer are ready to anchor STT state, but the live websocket path currently bypasses them.

### Environment and configuration patterns

* The backend loads env vars at startup with `dotenv/config` and configures CORS from `FRONTEND_URL`. See packages/backend/src/server.ts:1-16.
* Root and package-level env examples currently expose only Azure OpenAI variables for speech and LLM features: `.env.example` lists `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_LLM_DEPLOYMENT`, `AZURE_OPENAI_WHISPER_DEPLOYMENT`, and `AZURE_OPENAI_TTS_DEPLOYMENT` at .env.example:1-15. The package-level copies follow the same pattern in packages/backend/.env.example:3-10 and packages/frontend/.env.example:1-2.
* There is no existing Azure AI Speech endpoint, region, token, or locale variable in the workspace env examples.
* The README also documents Azure OpenAI as the only configured speech provider today. See README.md:25-33, 131-159, and 215-222.

### Azure Speech fit for this repo

* Official Microsoft guidance says microphone recognition in JavaScript is supported in the browser, not in Node.js, and points to browser samples plus token management patterns. Source: <https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech#create-a-speech-configuration-instance>.
* Official Microsoft guidance for JavaScript and TypeScript Speech SDK setup recommends `microsoft-cognitiveservices-speech-sdk` and secure credential handling through a backend-mediated token pattern. Source: <https://learn.microsoft.com/azure/ai-services/speech-service/get-started-speech-to-text>.
* Given the current Next.js browser frontend and Fastify backend split, the cleanest Azure Speech integration is browser-side continuous recognition with a backend token endpoint, not websocket upload of MediaRecorder blobs for server-side Whisper transcription.

## References

### Workspace evidence

* packages/frontend/src/app/interview/[questionId]/page.tsx:37-49
* packages/frontend/src/app/interview/[questionId]/page.tsx:51-83
* packages/frontend/src/hooks/use-audio-capture.ts:15-47
* packages/frontend/src/hooks/use-interview-socket.ts:17-23
* packages/frontend/src/hooks/use-interview-socket.ts:26-47
* packages/frontend/src/hooks/use-interview-socket.ts:63-82
* packages/frontend/src/stores/interview-store.ts:26-31
* packages/frontend/src/stores/interview-store.ts:48-57
* packages/frontend/src/app/dashboard/page.tsx:14-23
* packages/frontend/src/app/dashboard/page.tsx:40-50
* packages/backend/src/routes/ws.ts:36-46
* packages/backend/src/routes/ws.ts:61-63
* packages/backend/src/routes/ws.ts:88-101
* packages/backend/src/routes/ws.ts:106-141
* packages/backend/src/routes/sessions.ts:5-33
* packages/backend/src/routes/sessions.ts:54-102
* packages/backend/src/server.ts:11-28
* packages/backend/src/services/stt.ts:1-18
* packages/backend/src/services/tts.ts:9-18
* packages/backend/prisma/schema.prisma:50-77
* packages/shared/src/index.ts:25-40
* packages/shared/src/index.ts:84-93
* .env.example:1-15
* README.md:25-33
* README.md:131-159
* README.md:215-222

### External references

* Microsoft Learn, JavaScript speech recognition overview: <https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech#create-a-speech-configuration-instance>
* Microsoft Learn, Speech-to-text quickstart for JavaScript: <https://learn.microsoft.com/azure/ai-services/speech-service/get-started-speech-to-text>
* Microsoft Learn, Speech SDK overview for JavaScript: <https://learn.microsoft.com/javascript/api/overview/azure/microsoft-cognitiveservices-speech-sdk-readme?view=azure-node-latest#overview>

## Next research

* Validate the preferred auth shape for this deployment: Speech resource key plus region, full endpoint, or Entra-backed token issuance
* Decide whether finalized browser transcripts should be sent over the existing websocket, persisted over REST, or both
* Prototype transcript debouncing rules before automatic LLM feedback is enabled on final STT results

## Recommended insertion points

* Add a backend token endpoint as a new route module, for example `packages/backend/src/routes/speech.ts`, then register it in `packages/backend/src/server.ts:23-28`. This fits the current REST control-plane pattern better than overloading the websocket with credential bootstrap.
* Expose a route such as `GET /api/speech/token` or `POST /api/speech/token` that returns a short-lived Azure Speech auth token plus region or endpoint. Keep the Speech key backend-only. Add corresponding env vars next to the current Azure OpenAI config in `.env.example:6-11` and `packages/backend/.env.example:5-10`.
* Replace or augment `useAudioCapture` in `packages/frontend/src/hooks/use-audio-capture.ts:15-47` with a dedicated browser Speech SDK hook, for example `useAzureSpeechRecognition`, that:
  * acquires a token from the new backend endpoint
  * starts continuous recognition from the browser microphone
  * emits partial and final transcript events
  * exposes explicit recognition status and permission errors
* Keep `useInterviewSocket` in `packages/frontend/src/hooks/use-interview-socket.ts:63-72` for code updates, finalized transcript delivery, feedback, and TTS playback. In the recommended architecture, it should stop carrying raw audio chunks and instead send recognized text payloads or continue to use `request_feedback` on demand.
* Extend the client store in `packages/frontend/src/stores/interview-store.ts:26-31` and `packages/frontend/src/stores/interview-store.ts:48-57` with fields for `sessionId`, live transcript text, recognition state, and token refresh state.
* Thread `sessionId` into the interview page and websocket setup. The current interview route only uses `questionId` in `packages/frontend/src/app/interview/[questionId]/page.tsx:37-67`. If transcript persistence matters, create a session first through `packages/backend/src/routes/sessions.ts:5-33`, then connect the websocket with both `questionId` and `sessionId`.
* If transcripts should be durable, persist final recognized utterances into `SessionMessage` rows using the existing schema at `packages/backend/prisma/schema.prisma:50-77`. The websocket handler in `packages/backend/src/routes/ws.ts:61-141` is the natural place to attach persistence once a `sessionId` is available.
* Update shared protocol types in `packages/shared/src/index.ts:84-93` if the websocket starts carrying `transcript_partial`, `transcript_final`, `speech_status`, or `session_bound` events.

## Risks and pitfalls

* The current 3-second `MediaRecorder` chunking in packages/frontend/src/hooks/use-audio-capture.ts:22-33 introduces latency and eliminates native continuous-recognition semantics. If reused as-is, Azure Speech SDK benefits will be largely lost.
* The websocket connection is question-scoped, not session-scoped. See packages/frontend/src/hooks/use-interview-socket.ts:17 and packages/backend/src/routes/ws.ts:36-46. Reconnects will lose in-memory transcript history from packages/backend/src/routes/ws.ts:61-63.
* The mic toggle can become inconsistent with actual browser capture state because the store flips immediately even when `getUserMedia()` fails. See packages/frontend/src/app/interview/[questionId]/page.tsx:41-49 and packages/frontend/src/hooks/use-audio-capture.ts:17-35.
* The current frontend and shared websocket contracts assume transcript results arrive from backend STT after audio upload. If recognition moves to the browser, these contracts need to shift from audio transport to transcript transport. See packages/shared/src/index.ts:84-93.
* The current TTS playback path may have an audio container or MIME mismatch risk because the backend requests `opus` while the browser playback helper labels the blob as `audio/ogg`. See packages/backend/src/services/tts.ts:10-15 and packages/frontend/src/hooks/use-interview-socket.ts:76-82.
* Azure Speech browser auth should not expose a long-lived subscription key to the client. A backend token endpoint is the safest fit for this monorepo’s current shape and matches Microsoft guidance.

## Open questions

* Should live partial transcripts be shown in the UI separately from persisted final utterances?
* Should `request_feedback` remain a manual button, or should final recognized utterances automatically trigger feedback after silence or debounce?

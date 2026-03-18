# Azure AI Speech SDK continuous STT research

## Status
- Complete
- Repo-specific `researcher-subagent` file was not present under `.github/agents/**`; fallback behavior was applied per workspace guidance.

## Research topics
- Azure AI Speech SDK for continuous speech-to-text from a browser microphone
- TypeScript/JavaScript usage patterns
- Browser microphone capture and continuous recognition APIs
- Authentication options: subscription key, endpoint, token
- Client-direct vs server-mediated architectures
- Security implications of auth choices in web apps
- WebSocket/streaming considerations
- Official Microsoft/Azure documentation and code samples

## Findings
### Browser and SDK support

- **Browser microphone capture is supported for JavaScript only in a browser environment, not in Node.js.** Microsoft Learn explicitly states that microphone recognition isn't supported in Node.js and points browser developers to the React sample for microphone capture and token-management patterns.  
	Source: [How to recognize speech](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)

- **For browser mic capture, the primary audio setup is `AudioConfig.fromDefaultMicrophoneInput()`.** If you need device selection, the JavaScript API also exposes `AudioConfig.fromMicrophoneInput(deviceId)`.  
	Sources: [AudioConfig class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/audioconfig?view=azure-node-latest), [How to recognize speech](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)

- **The JavaScript SDK also supports custom stream input via `AudioConfig.fromStreamInput(...)`, including `MediaStream`, but the API docs note that custom audio stream input currently supports WAV/PCM.** This matters if you plan to capture audio yourself and feed the SDK rather than letting the SDK open the microphone.  
	Source: [AudioConfig class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/audioconfig?view=azure-node-latest)

### Continuous recognition APIs

- **`recognizeOnceAsync()` is single-shot only; for long-running transcription, Microsoft recommends `startContinuousRecognitionAsync()`.**  
	Sources: [SpeechRecognizer class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechrecognizer?view=azure-node-latest), [How to recognize speech](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)

- **Continuous recognition requires event-driven handling.** The relevant JS events documented by Microsoft are:
	- `recognizing` for intermediate hypotheses
	- `recognized` for final results
	- `canceled` for cancellation/transport/protocol failures
	- `sessionStopped` for end-of-session handling
	- inherited events also include `sessionStarted`, `speechStartDetected`, and `speechEndDetected`  
	Sources: [SpeechRecognizer class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechrecognizer?view=azure-node-latest), [How to recognize speech](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)

- **Stopping continuous recognition is explicit** via `stopContinuousRecognitionAsync()`. The SDK does not auto-manage lifecycle the way `recognizeOnceAsync()` does.  
	Sources: [SpeechRecognizer class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechrecognizer?view=azure-node-latest), [How to recognize speech](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)

- **`SpeechConfig.enableDictation()` is only supported for speech continuous recognition.** This is relevant if the app is closer to free-form dictation/captioning than command-and-control.  
	Source: [SpeechConfig class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechconfig?view=azure-node-latest)

- **Semantic segmentation is available for continuous recognition scenarios** and is intended to reduce “wall of text” or bad pause-based chunking; Learn documents it as suitable for dictation/captioning, not single-shot interactive scenarios.  
	Source: [How to recognize speech](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)

### Authentication options and constraints

- **Direct key-based auth exists in the JS SDK** via:
	- `SpeechConfig.fromSubscription(subscriptionKey, region)`
	- `SpeechConfig.fromEndpoint(endpoint, subscriptionKey)`
	- `SpeechConfig.fromHost(host, subscriptionKey)`  
	Source: [SpeechConfig class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechconfig?view=azure-node-latest)

- **Short-lived token auth is supported** via:
	- `SpeechConfig.fromAuthorizationToken(token, region)`
	- or `fromEndpoint(endpoint, "")` followed by `speechConfig.authorizationToken = token`  
	Source: [SpeechConfig class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechconfig?view=azure-node-latest)

- **Tokens issued from the Foundry/AI Services token endpoint are valid for 10 minutes.** Microsoft’s general authentication doc states this, and the official React sample refreshes proactively at 9 minutes (`maxAge: 540`).  
	Sources: [Authenticate requests to Azure AI services](https://learn.microsoft.com/azure/ai-services/authentication), [Azure Speech React sample README](https://github.com/Azure-Samples/AzureSpeechReactSample), [sample token utility](https://raw.githubusercontent.com/Azure-Samples/AzureSpeechReactSample/main/src/token_util.js)

- **Important token refresh nuance:** when a recognizer already exists, refreshing the token on `SpeechConfig` alone is not enough; Microsoft’s API docs say configuration values are copied when the recognizer is created, so you must update the recognizer’s `authorizationToken` as well for existing recognizers.  
	Source: [SpeechConfig.fromAuthorizationToken docs](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechconfig?view=azure-node-latest)

- **Microsoft Entra ID is supported, but with caveats.** Microsoft’s auth guidance says Entra authentication requires a **custom subdomain endpoint** (regional endpoints do not support Entra auth), plus role assignment such as `Cognitive Services Speech User` or `Cognitive Services Speech Contributor`. The Speech auth article also requires the resource ID for some flows.  
	Sources: [Authenticate requests to Azure AI services](https://learn.microsoft.com/azure/ai-services/authentication), [Microsoft Entra authentication with the Speech SDK](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-configure-azure-ad-auth)

- **The JS API reference exposes `SpeechConfig.fromEndpoint(URL, KeyCredential | TokenCredential)` and `tokenCredential`, indicating AAD/TokenCredential capability in the JavaScript SDK.** However, the clearest official browser sample still uses server-issued auth tokens rather than a pure SPA AAD flow.  
	Source: [SpeechConfig class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechconfig?view=azure-node-latest)

### Security implications for web apps

- **Microsoft explicitly warns not to include API keys directly in code or expose them publicly.**  
	Sources: [Get started with speech to text](https://learn.microsoft.com/azure/ai-services/speech-service/get-started-speech-to-text), [Authenticate requests to Azure AI services](https://learn.microsoft.com/azure/ai-services/authentication)

- **The official React sample demonstrates the recommended browser-safe pattern: a backend endpoint exchanges the Speech key for a short-lived token, and the frontend uses `fromAuthorizationToken(...)`.** The sample states the purpose is to avoid exposing the subscription key in the frontend.  
	Sources: [Azure Speech React sample README](https://github.com/Azure-Samples/AzureSpeechReactSample), [sample Express token endpoint](https://raw.githubusercontent.com/Azure-Samples/AzureSpeechReactSample/main/server/index.js), [sample App.js](https://raw.githubusercontent.com/Azure-Samples/AzureSpeechReactSample/main/src/App.js)

- **The sample also recommends protecting the backend token endpoint with your own user authentication/authorization in production.** That is a strong signal that “token endpoint open to the public internet” is not considered sufficient security by itself.  
	Source: [Azure Speech React sample README](https://github.com/Azure-Samples/AzureSpeechReactSample)

### Server-mediated vs client-direct patterns

- **Client-direct with subscription key:** technically possible with the SDK, but inappropriate for public browser apps because the key would be exposed.
- **Client-direct with short-lived token:** appropriate for browsers if the token is minted by a trusted backend and refreshed before expiry.
- **Server-mediated transcription:** useful when you need tighter control over auth, audit, metering, custom pre/post-processing, or when you want to centralize streaming/audio handling. But it adds latency and complexity, and the SDK/browser pattern already covers direct mic-to-Speech-service capture well.
- **Microsoft’s official browser sample favors “frontend recognizer + backend token issuance,” not “frontend streams raw audio to your backend first.”**  
	Sources: [Azure Speech React sample README](https://github.com/Azure-Samples/AzureSpeechReactSample), [sample Express token endpoint](https://raw.githubusercontent.com/Azure-Samples/AzureSpeechReactSample/main/server/index.js)

### WebSocket / streaming considerations

- **For continuous browser STT, use the Speech SDK rather than the short-audio REST pattern.** Microsoft’s quickstarts frame REST short-audio as a request/response operation and continuous recognition as an SDK/event-driven scenario.  
	Sources: [Get started with speech to text](https://learn.microsoft.com/azure/ai-services/speech-service/get-started-speech-to-text), [How to recognize speech](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)

- **Microsoft explicitly documents WebSocket-based query endpoint APIs for Speech containers, accessed through the SDK and Speech CLI.** This is the clearest official statement in the retrieved docs that Speech SDK traffic can use websocket-based endpoints.  
	Source: [How to recognize speech](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)

- **If you build your own streaming path into the SDK, raw PCM/WAV details matter.** The docs note that push-stream input assumes raw PCM and that headers may need to be stripped for best results.  
	Source: [How to recognize speech](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)

- **The JS API has Node-only proxy configuration methods.** That suggests browser transport is managed by the browser/runtime and not something you tune with SDK proxy settings.  
	Source: [SpeechConfig class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechconfig?view=azure-node-latest)

### Official code sample references

- **Official browser sample repo:** [Azure-Samples/AzureSpeechReactSample](https://github.com/Azure-Samples/AzureSpeechReactSample)
- **Browser mic sample implementation:** [src/App.js](https://raw.githubusercontent.com/Azure-Samples/AzureSpeechReactSample/main/src/App.js)
- **Backend token issuance example:** [server/index.js](https://raw.githubusercontent.com/Azure-Samples/AzureSpeechReactSample/main/server/index.js)
- **Token refresh helper example:** [src/token_util.js](https://raw.githubusercontent.com/Azure-Samples/AzureSpeechReactSample/main/src/token_util.js)
- **Official JS/TS SDK docs:** [SpeechRecognizer](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechrecognizer?view=azure-node-latest), [SpeechConfig](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechconfig?view=azure-node-latest), [AudioConfig](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/audioconfig?view=azure-node-latest)

### Recommended implementation direction

- **Recommended default for a web app:**
	1. Browser captures mic with the Speech SDK using `AudioConfig.fromDefaultMicrophoneInput()`.
	2. Browser creates `SpeechRecognizer` and uses `startContinuousRecognitionAsync()`.
	3. Frontend listens to `recognizing`, `recognized`, `canceled`, and `sessionStopped`.
	4. Backend exposes a protected `/speech/token` endpoint that exchanges the Speech key for a 10-minute token.
	5. Frontend uses `SpeechConfig.fromAuthorizationToken(token, region)` and refreshes the recognizer token before expiry.

- **Why this direction:** it aligns most closely with Microsoft’s official browser sample, avoids exposing subscription keys, preserves low-latency direct-to-service mic transcription, and is simpler than relaying raw audio through your own backend.

- **Use Entra ID only if you specifically need it.** It is viable, but adds operational prerequisites (custom domain, RBAC, token acquisition flow, resource ID handling) and is not the clearest official browser sample path for JavaScript.

- **Avoid key-in-browser implementations.** They are technically easy and operationally reckless — the worst kind of easy.

## Sources
- [How to recognize speech](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)
- [Quickstart: Recognize and convert speech to text](https://learn.microsoft.com/azure/ai-services/speech-service/get-started-speech-to-text)
- [Authenticate requests to Azure AI services](https://learn.microsoft.com/azure/ai-services/authentication)
- [Microsoft Entra authentication with the Speech SDK](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-configure-azure-ad-auth)
- [SpeechRecognizer class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechrecognizer?view=azure-node-latest)
- [SpeechConfig class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechconfig?view=azure-node-latest)
- [AudioConfig class](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/audioconfig?view=azure-node-latest)
- [Azure-Samples/AzureSpeechReactSample](https://github.com/Azure-Samples/AzureSpeechReactSample)
- [AzureSpeechReactSample/src/App.js](https://raw.githubusercontent.com/Azure-Samples/AzureSpeechReactSample/main/src/App.js)
- [AzureSpeechReactSample/src/token_util.js](https://raw.githubusercontent.com/Azure-Samples/AzureSpeechReactSample/main/src/token_util.js)
- [AzureSpeechReactSample/server/index.js](https://raw.githubusercontent.com/Azure-Samples/AzureSpeechReactSample/main/server/index.js)

## Next research
- Confirm whether Microsoft currently publishes a first-party **TypeScript** browser microphone sample for **continuous** recognition specifically, rather than the React JavaScript `recognizeOnceAsync` sample.
- Verify whether the JavaScript SDK has a dedicated first-party Learn article for **TokenCredential / Entra ID in browser SPAs**, rather than API-reference-only evidence.
- If implementation work follows, map continuous-recognition event handling onto the app’s existing WebSocket/state model.

## Open questions
- Microsoft’s Learn and API docs clearly document the JavaScript continuous-recognition APIs, but the most visible first-party browser sample retrieved is still centered on `recognizeOnceAsync()` rather than a full continuous-recognition UI flow.
- The API reference shows JavaScript `TokenCredential` support, but the retrieved docs do not provide an equally explicit browser-SPA walkthrough for Entra-based frontend auth.
- The retrieved official docs imply SDK-managed realtime transport and explicitly mention websocket-based endpoints for containers, but they do not provide a single concise public Learn page that fully explains transport mechanics for browser-to-cloud continuous STT.

# Changelog

## Unreleased

### Added
- **Four new API error codes** in the catalog (`describeErrorCode()`, hints,
  `err.retryable`):
  - `account_suspended` (403, `ForbiddenError`): the account that owns the key
    is suspended; every key and stream token on it is refused.
  - `file_url_host_not_allowed` (400, `ValidationError`): the URL given to
    `asr.transcribe()` or `animate.generate()` resolves or redirects to a
    private, loopback, link-local or otherwise non-public address.
  - `invalid_webhook_url` (400, `ValidationError`): `webhookUrl` is not a
    public http(s) URL.
  - `audio_url_unreadable` (422, `ValidationError`): `animate.generate()` could
    not download `audio_url` or read its duration (animations are now priced
    from the real audio length).

  Older SDK versions already raise these as the status-based class with the
  raw code on `err.code`; this adds the descriptions and hints.

## 0.2.0 — 2026-08-26

### Added
- **Method-aware, code-mapped errors.** Every error now names the SDK method
  that failed, rewrites endpoint hints into SDK calls, and ends with the
  machine-readable code and request id — e.g.
  `tts.generate(): Unknown voice — … Use tts.listVoices() … [unknown_voice_id · request 8f1c2d3e]`.
  All errors expose `code`, `method`; API errors add `hint`, `description`,
  `retryable`, `retryAfter`, and fall back to the `X-Request-Id` header for
  `requestId`.
- Error-code catalog: `ERROR_CODES`, `CLIENT_ERROR_CODES`, `STREAM_ERROR_CODES`,
  `STREAM_CLOSE_CODES`, `describeErrorCode()`, `describeStreamClose()`, plus the
  `ErrorCode` type.
- Code-specific classes: `StreamTokenError`, `UnknownVoiceError`,
  `VoiceNotReadyError`, `ConcurrencyLimitError`, `QueueLimitError`,
  `StreamConcurrencyError`, `ServiceUnavailableError` (503),
  `ServiceWarmingError` (`tts_warming`).
- Client-side classes replacing bare `Error`s: `ConfigurationError`
  (missing apiKey / credential / WebSocket), `InvalidArgumentError`,
  `StreamClosedError`, `NetworkError`, `RequestTimeoutError`.
- Streaming: an `error` event with code `upgrade_rejected` when the socket
  closes before `session.begin`; the `close` event now carries a
  `description` of the close code; `asr.stream()` rejects `language: "auto"`
  up front.
- Async TTS: `tts.generate({ mode: "async" })` returns a `TtsJobResponse`;
  `tts.getResult(id)` and `tts.poll(id)` fetch it (`TtsResultResponse`).
- **Real-time TTS streaming** — `client.tts.stream()` (`wss /dev/v1/tts/stream`,
  chunk-level events, mono PCM16LE @ 24 kHz) with `createPcmPlayer()` (browser
  playback), `pcmChunksToWav()` (Node), and the `chunkText()` sentence chunker.
- **Real-time ASR streaming** — `client.asr.stream()`
  (`wss /dev/v1/transcribe/stream`, interim + final transcripts).
- **Ephemeral stream tokens** — `client.auth.createStreamToken()` mints
  single-use `vmst_*` tokens; both stream methods accept `accessToken` so
  browsers can stream without exposing the API key.
- **Custom voices** — `tts.generate()`/`tts.stream()` accept your own cloned
  voice ids; `Voice.type` (`"preset" | "custom"`) on listings; `voice_not_ready`
  surfaces as a 422.
- **Output formats** — `tts.generate()` `output_format: "wav" | "mp3" | "ogg"`
  (real conversion server-side), echoed on the response.
- `client.tts.listLanguages()` — discover the currently enabled TTS languages
  (`GET /dev/v1/tts/languages`), including per-language capability flags and
  the platform's `default_language`. The catalog is admin-configured and can
  change at runtime.
- `UnsupportedLanguageError` (extends `ValidationError`) — thrown when the
  requested language is not in the platform catalog or is not available for
  the operation (`errorCode: "unsupported_language"` /
  `"streaming_unsupported_language"`).
- `errorCode` is now parsed from API error bodies and exposed on
  `VoiceMakerAPIError`.
- New types: `TtsLanguage`, `TtsLanguageListResponse`, `KnownLanguage`.

### Changed
- `PermissionError` is renamed `ForbiddenError` (same class, alias kept and
  deprecated) and `TimeoutError` is renamed `PollTimeoutError` (alias kept) —
  for parity with the Python SDK, where both names shadowed builtins.
- Unmapped 4xx statuses now surface as the base `VoiceMakerAPIError` instead
  of `ServerError`; 503 is `ServiceUnavailableError`.
- Non-JSON error responses (proxy pages, wrong `baseUrl`) still produce a
  typed error with code `http_<status>`.
- **Browser-safe build** — no top-level `node:` imports; Node builtins load
  lazily inside `postMultipart`, so bundlers (Next.js/webpack/Turbopack) can
  ship the SDK client-side.
- `SupportedLanguage` is now an open string type (`KnownLanguage | (string &
  {})`). The catalog is server-configured, so the compiled-in union can no
  longer be exhaustive; known codes are kept for autocomplete. Non-breaking.
- `tts.generate()`'s `language` is now optional — omitted, the server
  resolves the platform's default language.
- HTTP 400 responses now map to `ValidationError` (previously the generic
  `ServerError`).
- Yoruba (`yo`) and Igbo (`ig`) are now first-class languages server-side
  (previously aliases of `auto`) and can be streamed.

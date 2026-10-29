# myvoicemaker

Official JavaScript / TypeScript SDK for the [VoiceMaker](https://myvoicemaker.ai) API.

Generate dialect-accurate speech, transcribe audio in Nigerian languages, create lip-sync animations, and more — all from a single, fully typed client.

[![npm version](https://img.shields.io/npm/v/myvoicemaker)](https://www.npmjs.com/package/myvoicemaker)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Authentication](#authentication)
- [Supported Languages](#supported-languages)
- [Modules](#modules)
  - [Text-to-Speech (TTS)](#text-to-speech-tts)
  - [Automatic Speech Recognition (ASR)](#automatic-speech-recognition-asr)
  - [Lip-Sync Animation](#lip-sync-animation)
  - [Explain](#explain)
  - [Usage & Billing](#usage--billing)
- [Error Handling](#error-handling)
- [Polling Async Jobs](#polling-async-jobs)
- [TypeScript](#typescript)
- [Rate Limits](#rate-limits)

---

## Installation

```bash
npm install myvoicemaker
```

Requires **Node.js 18+** (uses native `fetch`). No other runtime dependencies.

---

## Quick Start

```typescript
import { VoiceMaker } from 'myvoicemaker';

const client = new VoiceMaker({ apiKey: 'vmk_live_...' });

// Generate speech
const tts = await client.tts.generate({
  text: 'Bawo ni o se wa?',
  voice_id: 'masoyinbo-male-conversational',
  language: 'yo',
});
console.log(tts.audio_url);

// Transcribe an audio file
const job = await client.asr.transcribeFile('./sermon.mp3', { language: 'yo' });
const result = await client.asr.poll(job.job_id, { timeoutMs: 120_000 });
console.log(result.text);
```

---

## Authentication

All requests require a developer API key passed as a Bearer token. Create and manage your keys from the [VoiceMaker Developer Dashboard](https://myvoicemaker.ai).

```typescript
const client = new VoiceMaker({ apiKey: 'vmk_live_...' });
```

| Key environment | Prefix | Credits consumed |
| :--- | :--- | :--- |
| Production | `vmk_live_` | Yes |
| Test / Sandbox | `vmk_test_` | No |

**Keep your API key secret.** Use environment variables in production:

```typescript
const client = new VoiceMaker({ apiKey: process.env.VOICEMAKER_API_KEY! });
```

### Configuration options

```typescript
const client = new VoiceMaker({
  apiKey: 'vmk_live_...',
  baseUrl: 'https://api.myvoicemaker.ai', // default
  timeoutMs: 30_000,                       // default: 30 seconds
});
```

---

## Supported Languages

Discover the current set with `client.tts.listLanguages()` instead
of hardcoding codes:

```typescript
const { default_language, languages } = await client.tts.listLanguages();

for (const language of languages) {
  console.log(
    `${language.code} — ${language.label}` +
      (language.supports_voice_clone ? ' (voice cloning)' : '') +
      (language.streaming_supported ? ' (streaming)' : ''),
  );
}
```

Codes known at this SDK release: `yo` (Yoruba), `ig` (Igbo), `ha` (Hausa),
`pcm` (Nigerian Pidgin), `en` (English) and `auto` (let the model detect the
language). Omitting `language` uses the platform's default
(`default_language` above).

---

## Modules

### Text-to-Speech (TTS)

Convert text into natural-sounding speech. Requests are **synchronous** — the audio URL is returned immediately.

#### `client.tts.listLanguages()`

Retrieve the languages currently enabled for synthesis.

**Returns** `TtsLanguageListResponse`

| Field | Type | Description |
| :--- | :--- | :--- |
| `default_language` | `string` | Code requests without a `language` resolve to |
| `languages` | `TtsLanguage[]` | `code`, `label`, `supports_voice_clone`, `supports_tone`, `supports_speed`, `streaming_supported` |

---

#### `client.tts.listVoices(params?)`

Retrieve all available voices, optionally filtered by language.

```typescript
const { voices } = await client.tts.listVoices({ language: 'yo' });

for (const voice of voices) {
  console.log(`${voice.id} — ${voice.name} (${voice.gender}, ${voice.style})`);
  console.log(`  Sample: ${voice.sample_url}`);
}
```

**Parameters**

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `language` | `string` (optional) | Filter by language code (see `listLanguages()`) |

**Returns** `VoiceListResponse`

| Field | Type |
| :--- | :--- |
| `voices` | `Voice[]` |

Each `Voice` has: `id`, `name`, `gender`, `language`, `style`, `sample_url`,
and `type` (`"preset"` for catalog voices, `"custom"` for your own cloned
voices).

---

#### `client.tts.generate(params)`

```typescript
const result = await client.tts.generate({
  text: 'Nne, ka anyị bido oge a.',
  voice_id: 'amaka',
  language: 'ig',
  speed: 0.9,
  output_format: 'mp3',
});

console.log(result.audio_url);      // https://media.myvoicemaker.ai/...
console.log(result.duration_seconds); // e.g. 3.2
console.log(result.credits_used);     // e.g. 28
```

**Parameters**

| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `text` | `string` | ✓ | Text to synthesise (max 5,000 characters) |
| `voice_id` | `string` | ✓ | Voice identifier from `listVoices()` |
| `language` | `string` | | Language code from `listLanguages()` (default: the platform's default language) |
| `speed` | `number` | | Playback speed: `0.5`–`2.0` (default `1.0`) |
| `output_format` | `string` | | `mp3` \| `wav` \| `ogg` (default `mp3`) |

**Returns** `TtsGenerateResponse`

| Field | Type |
| :--- | :--- |
| `id` | `string` |
| `audio_url` | `string` |
| `duration_seconds` | `number \| null` |
| `characters` | `number` |
| `credits_used` | `number` |
| `language` | `string` |
| `voice_id` | `string` |
| `created_at` | `string` (ISO 8601) |

---

#### `client.tts.generate({ ..., mode: "async" })`, `client.tts.getResult(id)`, `client.tts.poll(id, options?)` — async TTS

Sync `generate()` holds the HTTP connection while the engine synthesises, so it
can answer `503 tts_warming` (engine cold start) or `429 concurrency_limit_reached`
(your plan's processing cap is in use). Async mode never hits either: the job is
queued and returned as a `TtsJobResponse`, then fetched with `getResult()` or
awaited with `poll()`.

```typescript
const job = await client.tts.generate({
  text: 'Sannu da zuwa.',
  voice_id: 'amaka',
  language: 'ha',
  mode: 'async',                 // → TtsJobResponse { id, status: "queued", credits_reserved, ... }
});

const result = await client.tts.poll(job.id, { timeoutMs: 180_000 });
if (result.status === 'completed') {
  console.log(result.audio_url);   // TtsResultResponse
} else {
  console.error(result.error);     // status "failed"
}
```

`poll()` throws `PollTimeoutError` if the job is still running when `timeoutMs`
elapses — the job itself continues; call `getResult(id)` later.

#### `client.tts.stream(params)` — real-time streaming synthesis

Open a WebSocket session (`wss /dev/v1/tts/stream`): audio starts arriving
while later text is still being sent. See `examples/tts-stream-node.ts` and
`examples/tts-stream-browser.html` for full flows.

```typescript
const connection = client.tts.stream({
  voiceId: 'amaka',
  language: 'ha', // optional — defaults to the platform's default language
});
await connection.connected();
connection.sendText('Sannu! Yaya kake?');
connection.endText();
```

**Parameters**

| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `voiceId` | `string` | ✓ | Voice identifier from `listVoices()` |
| `language` | `string` | | Language code from `listLanguages()` — only languages with `streaming_supported` are accepted (default: the platform's default language) |
| `speed` | `number` | | Playback speed: `0.5`–`2.0` (default `1.0`) |
| `quality` | `string` | | `standard` (default, lowest latency) \| `high` |
| `accessToken` | `string` | | Single-use `vmst_*` stream token (browser auth) |

Output is mono PCM16LE @ 24 kHz. Play in the browser with
`createPcmPlayer()`, or collect chunks and wrap with `pcmChunksToWav()` in
Node.

---

### Automatic Speech Recognition (ASR)

Transcribe pre-recorded audio files. Jobs are **asynchronous** — submit a job, then poll for the result.

#### `client.asr.transcribe(params)` — from URL

```typescript
const job = await client.asr.transcribe({
  audio: 'https://storage.example.com/interview.wav',
  language: 'ha',
  webhookUrl: 'https://myapp.com/webhooks/voicemaker',
});
console.log(job.job_id);  // use this to poll
```

**Parameters**

| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `audio` | `string` | ✓ | Publicly accessible URL of the audio file |
| `language` | `string` | | Language code or `auto` (default) |
| `webhookUrl` | `string` | | Callback URL when the job completes |

---

#### `client.asr.transcribeFile(filePath, params?)` — from file

```typescript
const job = await client.asr.transcribeFile('./hausa-interview.mp3', {
  language: 'ha',
});
```

**Parameters**

| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `filePath` | `string` | ✓ | Absolute or relative path to the audio file |
| `language` | `string` | | Language code or `auto` (default) |
| `webhookUrl` | `string` | | Callback URL when the job completes |

Supported formats: `.mp3`, `.wav`, `.ogg`, `.m4a`, `.webm` — max 500 MB.

---

#### `client.asr.getResult(jobId)`

```typescript
const result = await client.asr.getResult('trans_1a2b3c...');
console.log(result.status); // 'queued' | 'processing' | 'completed' | 'failed'
console.log(result.text);
```

---

#### `client.asr.list(params?)`

```typescript
const page = await client.asr.list({ limit: 10, status: 'COMPLETED' });

for (const job of page.items) {
  console.log(`${job.job_id}: ${job.text?.slice(0, 60)}`);
}

// Load the next page
if (page.nextCursor) {
  const next = await client.asr.list({ cursor: page.nextCursor });
}
```

**Parameters**

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `limit` | `number` | Items per page: 1–100 (default `20`) |
| `cursor` | `string` | Pagination cursor from a previous response |
| `status` | `string` | Filter: `QUEUED` \| `PROCESSING` \| `COMPLETED` \| `FAILED` |

---

#### `client.asr.poll(jobId, options?)` — wait for completion

Polls `getResult` at a regular interval until the job reaches a terminal state (`completed` or `failed`).

```typescript
const result = await client.asr.poll(job.job_id, {
  intervalMs: 3_000,   // poll every 3 seconds (default: 2 000)
  timeoutMs: 120_000,  // give up after 2 minutes (default: 120 000)
});

if (result.status === 'completed') {
  console.log(`Transcript: ${result.text}`);
  console.log(`Language detected: ${result.detected_language}`);
  console.log(`Duration: ${result.duration_seconds}s`);
}
```

Throws `TimeoutError` if `timeoutMs` is exceeded before the job completes.

**TranscriptionJob shape**

| Field | Type |
| :--- | :--- |
| `job_id` | `string` |
| `status` | `'queued' \| 'processing' \| 'completed' \| 'failed'` |
| `language` | `string` |
| `detected_language` | `string \| null` |
| `text` | `string \| null` |
| `confidence` | `number \| null` |
| `duration_seconds` | `number \| null` |
| `credits_used` | `number \| null` |
| `created_at` | `string` (ISO 8601) |
| `completed_at` | `string \| null` (ISO 8601) |

#### `client.asr.stream(params)` — real-time streaming (WebSocket)

Transcribe live audio with interim results as you speak. Requires a global
`WebSocket` (browsers, Node >= 22, Bun, Deno) — no extra dependencies.

```typescript
const stream = client.asr.stream({ language: 'yo', sampleRate: 16000 });

stream.on('open', (s) => console.log('session', s.session_id));
stream.on('transcript', (t) => {
  if (t.is_final) console.log('FINAL:', t.text);
  else console.log('interim:', t.text);
});
stream.on('end', (e) => console.log(`used ${e.credits_used} credits over ${e.duration_seconds}s`));

// Send PCM16LE mono chunks (e.g. from a mic or a decoded file), 50-250ms each:
stream.sendAudio(pcmChunk);

// Force pending words into a final without closing:
stream.finalize();

// Flush the tail and end the session (resolves with the session summary):
const summary = await stream.close();
```

**Parameters**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `language` | `'yo' \| 'ig' \| 'ha' \| 'pcm' \| 'en'` | Yes | Explicit language — `auto` is batch-only. |
| `sampleRate` | `number` | No | Sample rate of your PCM16LE mono audio. Default `16000` (8000-48000). |
| `interimResults` | `boolean` | No | Emit revisable interim transcripts. Default `true`. |
| `useSubprotocolAuth` | `boolean` | No | Authenticate via `Sec-WebSocket-Protocol` (default, works everywhere incl. browsers). Set `false` to use `?api_key=`. |
| `keepAliveMs` | `number` | No | KeepAlive interval; `0` disables. Default `10000`. |

**Events**: `open` (session.begin), `transcript` (`{ text, is_final, start, end, confidence }`),
`finalized`, `end` (`{ duration_seconds, credits_used, reason }`), `error` (`{ code, message }`), `close`.

**Billing**: purchased credits only, at the transcription per-second rate; reserved in
60-second blocks while streaming and settled to the exact second at close. Idle
connections (no audio or KeepAlive for 30s) are closed; stream duration is
capped per plan (up to 60 minutes) — reconnect to continue. The finished
session is also retrievable afterwards via `client.asr.getResult(job_id)`.

---

### Lip-Sync Animation

Generate a lip-sync video by combining a portrait image with an audio file. Jobs are **asynchronous**.

#### `client.animate.generate(params)`

```typescript
const job = await client.animate.generate({
  image_url: 'https://example.com/speaker-portrait.jpg',
  audio_url: tts.audio_url,
  output_format: 'mp4',
});
console.log(job.job_id);
console.log(`Estimated credits: ${job.estimated_credits}`);
```

**Parameters**

| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `image_url` | `string` | ✓ | URL of the source portrait image (max 5 MB, up to 4K) |
| `audio_url` | `string` | ✓ | URL of the audio file (max 30 seconds) |
| `output_format` | `string` | | `mp4` \| `webm` (default `mp4`) |

---

#### `client.animate.getResult(jobId)`

```typescript
const result = await client.animate.getResult('anim_1a2b3c...');
console.log(result.status);    // 'queued' | 'processing' | 'completed' | 'failed'
console.log(result.video_url); // null until completed
```

---

#### `client.animate.poll(jobId, options?)`

```typescript
const result = await client.animate.poll(job.job_id, {
  intervalMs: 5_000,
  timeoutMs: 300_000,
});

if (result.status === 'completed') {
  console.log(`Video: ${result.video_url}`);
  console.log(`Duration: ${result.duration_seconds}s`);
}
```

---

### Explain

Process text in Nigerian languages — explain, summarise, translate, or simplify content using AI.

#### `client.explain.process(params)`

```typescript
const result = await client.explain.process({
  text: 'Ìwé Mímọ̀ sọ pé...',
  language: 'yo',
  action: 'translate',
  target_language: 'en',
  max_words: 250,
});

console.log(result.result);       // translated text
console.log(result.tokens_used);  // e.g. 145
console.log(result.credits_used); // e.g. 145
```

**Parameters**

| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `text` | `string` | ✓ | Input text to process |
| `language` | `string` | ✓ | Source language code |
| `action` | `string` | ✓ | `explain` \| `summarize` \| `translate` \| `simplify` |
| `target_language` | `string` | | Required when `action` is `translate` |
| `max_words` | `number` | | Soft length target in words: 1–1000 (default `250`). Not a hard cap — sentences always complete. |

---

### Usage & Billing

#### `client.usage.getBalance()`

```typescript
const balance = await client.usage.getBalance();

console.log(`Tier:              ${balance.tier}`);
console.log(`Credits remaining: ${balance.credits_remaining.toLocaleString()}`);
console.log(`Credits used:      ${balance.credits_used.toLocaleString()}`);
```

**Returns** `UsageBalanceResponse`

| Field | Type |
| :--- | :--- |
| `account_id` | `string` |
| `tier` | `'free' \| 'starter' \| 'growth' \| 'pro' \| 'enterprise'` |
| `credits_remaining` | `number` |
| `credits_used` | `number` |
| `credits_total` | `number` (present only if credits were ever purchased) |
| `credits_expire` | `string \| null` |
| `created_at` | `string` (ISO 8601) |

---

#### `client.usage.getBreakdown(params)`

```typescript
const report = await client.usage.getBreakdown({
  start_date: '2026-05-01T00:00:00Z',
  end_date:   '2026-05-31T23:59:59Z',
  module:     'asr', // optional filter
});

for (const entry of report.breakdown) {
  console.log(`${entry.module}: ${entry.requests} requests, ${entry.credits_used} credits`);
}
console.log(`Total: ${report.total_credits_used} credits`);
```

**Parameters**

| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `start_date` | `string` | ✓ | ISO 8601 datetime (inclusive) |
| `end_date` | `string` | ✓ | ISO 8601 datetime (inclusive) |
| `module` | `string` | | Filter: `tts` \| `asr` \| `animate` \| `explain` |

---

## Error Handling

Every failure is thrown as a typed error that extends `VoiceMakerError`. The
message names the **SDK method** that failed, explains what went wrong in SDK
terms, and ends with the machine-readable code and therequest id to quote to support:

```
tts.generate(): Unknown voice — voice_id 'foo' does not match an enabled voice
preset or one of your custom voices. Use tts.listVoices() for the list of
available voices. [unknown_voice_id · request 8f1c2d3e]
```

Branch on the class for coarse handling and on `err.code` for exact cases:

```typescript
import {
  VoiceMakerError,
  VoiceMakerAPIError,
  AuthenticationError,
  InsufficientCreditsError,
  RateLimitError,
  ServiceWarmingError,
  UnknownVoiceError,
  ValidationError,
  PollTimeoutError,
} from 'myvoicemaker';

try {
  const result = await client.tts.generate({ text, voice_id: 'amaka' });
} catch (err) {
  if (err instanceof UnknownVoiceError) {
    const { voices } = await client.tts.listVoices();     // err.hint says the same
  } else if (err instanceof ServiceWarmingError) {
    await sleep((err.retryAfter ?? 60) * 1000);           // or generate({ mode: "async" })
  } else if (err instanceof RateLimitError) {
    await sleep((err.retryAfter ?? 60) * 1000);
  } else if (err instanceof InsufficientCreditsError) {
    notifyBilling(err.requestId);
  } else if (err instanceof ValidationError) {
    console.error(err.issues);                             // [{ field, code, message }]
  } else if (err instanceof AuthenticationError) {
    rotateKey();
  } else if (err instanceof VoiceMakerAPIError) {
    if (err.retryable) scheduleRetry(); else report(err.code, err.requestId);
  } else if (err instanceof PollTimeoutError) {
    // the job is still running — fetch it later with getResult(err.jobId)
  } else if (err instanceof VoiceMakerError) {
    console.error(err.code, err.message);                  // network_error, request_timeout, ...
  }
}
```

### Error classes

Classes by HTTP status, refined by error code where developers need to branch:

| Class | Status | Codes | Meaning |
| :--- | :--- | :--- | :--- |
| `AuthenticationError` | 401 | `missing_api_key`, `invalid_api_key`, `api_key_expired` | The key is missing, wrong, or expired |
| ↳ `StreamTokenError` | 401/403 | `invalid_stream_token`, `stream_token_kind_mismatch` | Ephemeral stream token rejected — mint a fresh one with `auth.createStreamToken()` |
| `ForbiddenError` (alias `PermissionError`, deprecated) | 403 | `api_key_revoked`, `project_disabled`, `account_suspended`, `api_access_not_enabled`, `insufficient_scope` | The key exists but may not make this call |
| `InsufficientCreditsError` | 402 | `insufficient_credits` | Not enough purchased credits |
| `NotFoundError` | 404 | `not_found`, `endpoint_not_found` | Unknown job id, or a wrong `baseUrl` |
| `FileSizeLimitError` | 413 | `file_size_limit_exceeded`, `file_too_large` | Audio exceeds the plan / endpoint limit |
| `UnsupportedMediaTypeError` | 415 | `unsupported_media`, `missing_audio_stream`, `unsupported_content_type`, … | Media format or content type not accepted |
| `ValidationError` | 400/422 | `invalid_payload`, `invalid_query`, `voice_id_required`, `file_url_unreachable`, `file_url_host_not_allowed`, `invalid_webhook_url`, `audio_url_unreadable`, … | Bad request values — check `err.issues` |
| ↳ `UnsupportedLanguageError` | 400 | `unsupported_language`, `streaming_unsupported_language` | Language not enabled / not streamable — see `tts.listLanguages()` |
| ↳ `UnknownVoiceError` | 422 | `unknown_voice_id` | Voice id matches nothing — see `tts.listVoices()` |
| ↳ `VoiceNotReadyError` | 422 | `voice_not_ready` | Custom voice still processing or failed |
| `RateLimitError` | 429 | `rate_limited` | Per-minute / daily request limit — wait `err.retryAfter` |
| ↳ `ConcurrencyLimitError` | 429 | `concurrency_limit_reached` | Plan's processing cap in use — retry or use `mode: "async"` |
| ↳ `QueueLimitError` | 429 | `queue_limit_reached` | Too many jobs queued |
| ↳ `StreamConcurrencyError` | 429 | `stream_concurrency_limit` | Concurrent-stream cap in use |
| `ServiceUnavailableError` | 503 | `stream_capacity`, `streaming_unavailable`, `token_service_unavailable`, `file_storage_unavailable`, … | Temporarily unavailable — retry later |
| ↳ `ServiceWarmingError` | 503 | `tts_warming` | Speech engine cold-starting — retry in `err.retryAfter`s or use `mode: "async"` |
| `ServerError` | 5xx | `synthesis_failed`, `explain_failed`, `internal_error`, … | Server failed while processing — usually retryable |
| `VoiceMakerAPIError` | any | any | Base class of everything above |

Client-side errors (no HTTP exchange happened) also extend `VoiceMakerError`:

| Class | Code | When |
| :--- | :--- | :--- |
| `ConfigurationError` | `api_key_required`, `credential_required`, `websocket_unavailable` | Missing key / stream credential / WebSocket runtime |
| `InvalidArgumentError` | `invalid_argument` | An argument was rejected before any request (`err.argument`) |
| `StreamClosedError` | `stream_not_open` | `sendAudio()`/`sendText()` on a closed stream |
| `NetworkError` | `network_error` | DNS, refused connection, TLS, CORS (`err.cause` is the original error) |
| `RequestTimeoutError` | `request_timeout` | No response within `timeoutMs` |
| `PollTimeoutError` (alias `TimeoutError`, deprecated) | `poll_timeout` | `poll()` gave up; the job keeps running (`err.jobId`) |

### Error properties

```typescript
err.code        // stable machine-readable code, e.g. "unknown_voice_id" (or "http_502")
err.method      // SDK method that failed, e.g. "tts.generate"
err.message     // "tts.generate(): Unknown voice — … [unknown_voice_id · request 8f1c2d3e]"
// API errors (VoiceMakerAPIError and subclasses) additionally expose:
err.status      // HTTP status code
err.error       // Short title from the API
err.detail      // Explanation, with endpoint references rewritten to SDK methods
err.hint        // What to do about it (from the catalog)
err.description // What the code means (from the catalog)
err.retryable   // Whether repeating the same call later can succeed
err.retryAfter  // Seconds to wait, when the API sent Retry-After
err.requestId   // Request id for support (body or X-Request-Id header)
err.issues      // Validation issues [{ field, code, message }] (400/422 only)
err.errorCode   // Raw errorCode from the response body (undefined if the API sent none)
```

### Error-code catalog

`ERROR_CODES`, `CLIENT_ERROR_CODES` and `STREAM_ERROR_CODES` are exported so you
can look codes up (or build your own messages):

```typescript
import { ERROR_CODES, describeErrorCode, describeStreamClose } from 'myvoicemaker';

ERROR_CODES.tts_warming.retryable;        // true
describeErrorCode(err.code)?.hint;        // "Retry in about err.retryAfter seconds, or …"
describeStreamClose(4002);                // "Purchased credits were exhausted."
```

The full list with meanings lives on the [Error Codes](https://docs.myvoicemaker.ai/error-codes)
page of the API docs.

### Streaming errors

Failures while **connecting** (`asr.stream()` / `tts.stream()`) are hidden by
the WebSocket API in browsers and Node — the SDK emits an `error` event with
code `upgrade_rejected` listing the likely causes, followed by `close`. Errors
**during** a session arrive as `error` events (`invalid_message`,
`text_too_large`, `session_char_limit`, `insufficient_credits`, `idle_timeout`,
`upstream_unavailable`, `internal_error`); the `close` event carries a
`description` of the close code (`1000`, `4002`, `4008`, `4009`, `1011`, `1013`).

---

## Polling Async Jobs

ASR and Animation jobs are processed asynchronously. The SDK's `poll()` helper handles the retry loop for you:

```typescript
// Submit
const job = await client.asr.transcribeFile('./audio.mp3', { language: 'en' });

// Poll until done
const result = await client.asr.poll(job.job_id, {
  intervalMs: 2_000,   // how often to check (default: 2 000 ms)
  timeoutMs: 120_000,  // maximum wait time (default: 120 000 ms)
});
```

Alternatively, manage polling manually:

```typescript
let result = await client.asr.getResult(job.job_id);

while (result.status === 'queued' || result.status === 'processing') {
  await new Promise(r => setTimeout(r, 3000));
  result = await client.asr.getResult(job.job_id);
}
```

---

## TypeScript

The SDK is written in TypeScript and ships with full type declarations. No additional `@types` packages are needed.

```typescript
import type {
  VoiceMakerConfig,
  TranscriptionJob,
  TtsGenerateResponse,
  AnimateResultResponse,
  VoiceListResponse,
  Voice,
  UsageBalanceResponse,
  SupportedLanguage,
  JobStatus,
  PollOptions,
} from 'myvoicemaker';
```

All response objects, request parameters, error classes, and union literals are exported directly from the package root.

---

## Rate Limits

Rate limits are enforced per API key and vary by plan:

| Plan | Requests / min | Concurrent jobs |
| :--- | :--- | :--- |
| Growth | 60 | 5 |
| Pro | 120 | 10 |
| Enterprise | Custom | Custom |

When a limit is exceeded the SDK throws `RateLimitError`. The `Retry-After` header value (seconds) is available as `err.retryAfter`.

Each API response also includes rate limit metadata in the response headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`).

---

## Credit Costs

| Module | Billable unit | Cost |
| :--- | :--- | :--- |
| TTS | Input characters | 1 credit / character |
| ASR | Audio duration | 5 credits / second |
| Animate | Video duration | 50 credits / second |
| Explain | LLM tokens | 1 credit / token |

---

## License

MIT © [EqualyzAI](https://github.com/equalyzai)

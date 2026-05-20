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

| Language | Code | Auto-detect (ASR) |
| :--- | :--- | :---: |
| Yoruba | `yo` | ✓ |
| Igbo | `ig` | ✓ |
| Hausa | `ha` | ✓ |
| Nigerian Pidgin | `pcm` | ✓ |
| English | `en` | ✓ |
| Auto-detect | `auto` | — |

---

## Modules

### Text-to-Speech (TTS)

Convert text into natural-sounding speech. Requests are **synchronous** — the audio URL is returned immediately.

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
| `language` | `string` (optional) | Filter by language code: `yo`, `ig`, `ha`, `pcm`, `en` |

**Returns** `VoiceListResponse`

| Field | Type |
| :--- | :--- |
| `voices` | `Voice[]` |

Each `Voice` has: `id`, `name`, `gender`, `language`, `style`, `sample_url`.

---

#### `client.tts.generate(params)`

```typescript
const result = await client.tts.generate({
  text: 'Nne, ka anyị bido oge a.',
  voice_id: 'sunday-okafor-male-conversational',
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
| `language` | `string` | ✓ | Language code |
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

> **Note:** This module targets a planned endpoint. Check the [changelog](https://myvoicemaker.ai/docs/changelog) for availability.

#### `client.explain.process(params)`

```typescript
const result = await client.explain.process({
  text: 'Ìwé Mímọ̀ sọ pé...',
  language: 'yo',
  action: 'translate',
  target_language: 'en',
  max_tokens: 500,
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
| `max_tokens` | `number` | | Response length limit: 1–2000 (default `500`) |

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

Every API error is thrown as a typed exception that extends `VoiceMakerAPIError`.

```typescript
import {
  VoiceMakerError,
  AuthenticationError,
  InsufficientCreditsError,
  RateLimitError,
  ValidationError,
  NotFoundError,
  TimeoutError,
} from 'myvoicemaker';

try {
  const result = await client.tts.generate({ ... });
} catch (err) {
  if (err instanceof AuthenticationError) {
    console.error('Invalid or expired API key');
  } else if (err instanceof InsufficientCreditsError) {
    console.error('Not enough credits. Top up at myvoicemaker.ai/billing');
  } else if (err instanceof RateLimitError) {
    const wait = err.retryAfter ?? 60;
    console.error(`Rate limited. Retry in ${wait}s`);
  } else if (err instanceof ValidationError) {
    console.error('Invalid parameters:', err.issues);
  } else if (err instanceof TimeoutError) {
    console.error(`Job ${err.jobId} timed out after ${err.timeoutMs}ms`);
  } else if (err instanceof VoiceMakerError) {
    console.error(`API error ${err.status}: ${err.detail}`);
  }
}
```

### Error classes

| Class | HTTP Status | Description |
| :--- | :--- | :--- |
| `AuthenticationError` | 401 | Missing or invalid API key |
| `InsufficientCreditsError` | 402 | Insufficient purchased credits |
| `PermissionError` | 403 | Key lacks required scope or plan |
| `NotFoundError` | 404 | Resource not found |
| `FileSizeLimitError` | 413 | Audio file exceeds plan size limit |
| `UnsupportedMediaTypeError` | 415 | Unsupported file format |
| `ValidationError` | 422 | Invalid request parameters (check `.issues`) |
| `RateLimitError` | 429 | Rate limit or concurrency limit exceeded |
| `ServerError` | 500/503 | Internal server error |
| `TimeoutError` | — | `poll()` timed out waiting for job completion |

All HTTP error classes expose:

```typescript
err.status      // HTTP status code
err.error       // Short error title from the API
err.detail      // Human-readable explanation
err.requestId   // Request ID for support (from X-Request-Id header)
err.issues      // Validation issues array (ValidationError only)
```

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

MIT © [Collins Edim](https://github.com/equalyzai)

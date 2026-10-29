/**
 * Error-code catalog for the VoiceMaker developer API.
 *
 * Every non-2xx response from `/dev/v1` carries a stable, machine-readable
 * `errorCode` (snake_case). This file is the SDK's copy of that contract: it
 * maps each code to its canonical HTTP status, a one-line meaning and — most
 * importantly — what to do about it, phrased in terms of SDK methods rather
 * than raw endpoints. The Python SDK ships the same table; the docs "Error
 * Codes" page is generated from the same source of truth.
 *
 * Codes never get renamed once shipped. New codes may appear; anything the
 * SDK does not recognise still surfaces as a typed error keyed by HTTP status
 * with the raw code on `err.code`.
 */

export interface ErrorCodeInfo {
  /** Canonical HTTP status the API uses for this code. */
  status: number;
  /** Short title, matching the API's `error` field. */
  title: string;
  /** What went wrong. */
  description: string;
  /** What to do about it, in SDK terms. */
  hint: string;
  /** Whether repeating the same call later can succeed without changes. */
  retryable: boolean;
}

const define = <const T extends Record<string, ErrorCodeInfo>>(codes: T) => codes;

/** Codes returned by the REST API and by the pre-upgrade HTTP phase of the WebSocket endpoints. */
export const ERROR_CODES = define({
  // ---- authentication & authorisation ------------------------------------
  missing_api_key: {
    status: 401,
    title: "Unauthorized",
    description: "No API key was sent with the request.",
    hint: "Pass your key when constructing the client: new VoiceMaker({ apiKey }).",
    retryable: false,
  },
  invalid_api_key: {
    status: 401,
    title: "Unauthorized",
    description:
      "The API key is malformed, unknown, or belongs to the other environment (test vs live).",
    hint: "Check the key for typos — keys look like vmk_live_… or vmk_test_…. Create one in the dashboard under Developer → API keys.",
    retryable: false,
  },
  api_key_expired: {
    status: 401,
    title: "Unauthorized",
    description: "The API key has passed its expiry date.",
    hint: "Create a new key in the dashboard and update new VoiceMaker({ apiKey }).",
    retryable: false,
  },
  api_key_revoked: {
    status: 403,
    title: "Forbidden",
    description: "The API key was revoked.",
    hint: "Create a new key in the dashboard and update new VoiceMaker({ apiKey }).",
    retryable: false,
  },
  project_disabled: {
    status: 403,
    title: "Forbidden",
    description: "The developer project that owns this key is disabled.",
    hint: "Re-enable the project in the dashboard, or use a key from an active project.",
    retryable: false,
  },
  account_suspended: {
    status: 403,
    title: "Forbidden",
    description:
      "The account that owns this API key is suspended, so all of its keys and stream tokens are refused.",
    hint: "Contact VoiceMaker support with the requestId to resolve the suspension; creating a new key will not help.",
    retryable: false,
  },
  api_access_not_enabled: {
    status: 403,
    title: "Forbidden",
    description:
      "The account's plan does not include API access and it has no purchased credits.",
    hint: "Upgrade to Growth, Pro or Enterprise, or buy credits; usage.getBalance() shows the current balance.",
    retryable: false,
  },
  insufficient_scope: {
    status: 403,
    title: "Forbidden",
    description:
      "The key lacks the scope this call needs (transcriptions:read or transcriptions:write).",
    hint: "Create a key with the required scope in the dashboard.",
    retryable: false,
  },
  rate_limited: {
    status: 429,
    title: "Rate limit exceeded",
    description: "The key exceeded its per-minute or daily request limit.",
    hint: "Wait err.retryAfter seconds (the Retry-After header) before retrying, and spread requests over time.",
    retryable: true,
  },
  invalid_stream_token: {
    status: 401,
    title: "Unauthorized",
    description: "The stream token is invalid, expired, or was already used.",
    hint: "Mint a fresh token with auth.createStreamToken() immediately before connecting — tokens are single-use and short-lived.",
    retryable: false,
  },
  stream_token_kind_mismatch: {
    status: 403,
    title: "Forbidden",
    description: "The stream token was minted for the other kind of stream.",
    hint: 'Mint with auth.createStreamToken({ type: "asr" }) for asr.stream() and { type: "tts" } for tts.stream().',
    retryable: false,
  },

  // ---- request validation -------------------------------------------------
  invalid_json: {
    status: 400,
    title: "Invalid request",
    description: "The request body was not valid JSON.",
    hint: "The SDK always sends JSON — if you see this, report it with the requestId.",
    retryable: false,
  },
  invalid_json_shape: {
    status: 400,
    title: "Invalid request",
    description: "The request body must be a JSON object.",
    hint: "The SDK always sends an object — if you see this, report it with the requestId.",
    retryable: false,
  },
  invalid_payload: {
    status: 400,
    title: "Invalid request",
    description: "One or more request fields failed validation.",
    hint: "Inspect err.issues for the offending fields.",
    retryable: false,
  },
  invalid_query: {
    status: 400,
    title: "Invalid request",
    description: "One or more query parameters failed validation.",
    hint: "Inspect err.issues for the offending parameters.",
    retryable: false,
  },
  invalid_cursor: {
    status: 400,
    title: "Invalid cursor",
    description: "The pagination cursor could not be decoded.",
    hint: "Pass the nextCursor value from the previous asr.list() page unchanged.",
    retryable: false,
  },
  invalid_date_range: {
    status: 400,
    title: "Invalid date range",
    description: "start_date must be before end_date.",
    hint: "Check the dates passed to usage.getBreakdown().",
    retryable: false,
  },
  invalid_multipart_body: {
    status: 400,
    title: "Invalid request",
    description: "The multipart upload could not be parsed.",
    hint: "Retry asr.transcribeFile(); if it persists, report it with the requestId.",
    retryable: false,
  },
  invalid_multipart_payload: {
    status: 400,
    title: "Invalid request",
    description: "The multipart form fields failed validation.",
    hint: "Inspect err.issues for the offending fields.",
    retryable: false,
  },
  missing_audio: {
    status: 400,
    title: "Invalid request",
    description: "The upload contained no audio file.",
    hint: "Pass the path of an existing audio or video file to asr.transcribeFile().",
    retryable: false,
  },
  unsupported_content_type: {
    status: 415,
    title: "Unsupported content type",
    description: "The request Content-Type is not one the endpoint accepts.",
    hint: "Use asr.transcribe() for URLs and asr.transcribeFile() for local files.",
    retryable: false,
  },
  voice_id_required: {
    status: 400,
    title: "Voice required",
    description: "Every text-to-speech request needs a voice.",
    hint: "Pick an id from tts.listVoices() and pass it as voice_id to tts.generate() or voiceId to tts.stream().",
    retryable: false,
  },
  unsupported_language: {
    status: 400,
    title: "Unsupported language",
    description: "The language is not in the platform's language catalog.",
    hint: "Call tts.listLanguages() for the codes currently enabled.",
    retryable: false,
  },
  streaming_unsupported_language: {
    status: 400,
    title: "Streaming unsupported for this language",
    description: "The language is served by batch synthesis only.",
    hint: "Use tts.generate() for this language, or pick one with streaming_supported: true from tts.listLanguages().",
    retryable: false,
  },

  // ---- transcription input --------------------------------------------------
  empty_file: {
    status: 400,
    title: "Submission failed",
    description: "The uploaded file is empty.",
    hint: "Check the file path passed to asr.transcribeFile().",
    retryable: false,
  },
  invalid_file_url: {
    status: 400,
    title: "Submission failed",
    description: "The audio URL is not a valid URL.",
    hint: "Pass an absolute http(s) URL to asr.transcribe().",
    retryable: false,
  },
  unsupported_file_url_protocol: {
    status: 400,
    title: "Submission failed",
    description: "Only http and https URLs are accepted.",
    hint: "Host the file on an http(s) URL and pass that to asr.transcribe().",
    retryable: false,
  },
  file_url_credentials_not_allowed: {
    status: 400,
    title: "Submission failed",
    description: "The audio URL must not embed a username or password.",
    hint: "Use a public or pre-signed URL instead.",
    retryable: false,
  },
  file_url_host_not_allowed: {
    status: 400,
    title: "Submission failed",
    description:
      "The media URL resolves to, or redirects to, a host the server will not fetch from (a private, loopback, link-local or otherwise non-public address).",
    hint: "Use a URL on the public internet for asr.transcribe() or animate.generate(), or upload the file with asr.transcribeFile().",
    retryable: false,
  },
  invalid_webhook_url: {
    status: 400,
    title: "Invalid webhook URL",
    description:
      "webhookUrl must be a public http or https URL; private, loopback and link-local addresses are refused.",
    hint: "Pass an endpoint reachable from the public internet as webhookUrl, or leave it out and wait for the job with asr.poll().",
    retryable: false,
  },
  file_url_unreachable: {
    status: 422,
    title: "Submission failed",
    description: "The server could not reach the audio URL.",
    hint: "Make sure the URL is reachable from the public internet (not localhost or a private network).",
    retryable: false,
  },
  file_url_fetch_failed: {
    status: 422,
    title: "Submission failed",
    description: "The audio URL did not return a usable file.",
    hint: "Verify the URL returns the raw media file with a 2xx response.",
    retryable: false,
  },
  empty_remote_file: {
    status: 422,
    title: "Submission failed",
    description: "The audio URL returned an empty file.",
    hint: "Verify the URL serves the media file.",
    retryable: false,
  },
  file_too_large: {
    status: 413,
    title: "Submission failed",
    description: "The file exceeds the endpoint's hard upload limit.",
    hint: "Trim or compress the audio before submitting.",
    retryable: false,
  },
  file_size_limit_exceeded: {
    status: 413,
    title: "File too large",
    description: "The file exceeds your plan's file-size limit.",
    hint: "Compress the audio, split it, or upgrade your plan.",
    retryable: false,
  },
  unsupported_media: {
    status: 415,
    title: "Submission failed",
    description: "The file could not be read as audio or video.",
    hint: "Submit a standard format such as mp3, wav, m4a, mp4 or webm.",
    retryable: false,
  },
  invalid_media_metadata: {
    status: 415,
    title: "Submission failed",
    description: "The media file could not be inspected safely.",
    hint: "Re-encode the file into a standard format such as mp3, wav, m4a, mp4 or webm.",
    retryable: false,
  },
  missing_audio_stream: {
    status: 415,
    title: "Submission failed",
    description: "The file has no audio track.",
    hint: "Submit a file that contains audio.",
    retryable: false,
  },
  unsupported_media_type: {
    status: 415,
    title: "Submission failed",
    description: "The media format is not supported.",
    hint: "Submit a standard format such as mp3, wav, m4a, mp4 or webm.",
    retryable: false,
  },
  file_inspection_unavailable: {
    status: 503,
    title: "Submission failed",
    description: "Media inspection is temporarily unavailable on the server.",
    hint: "Retry shortly.",
    retryable: true,
  },
  file_storage_unavailable: {
    status: 503,
    title: "Submission failed",
    description: "Media storage is temporarily unavailable on the server.",
    hint: "Retry shortly.",
    retryable: true,
  },
  ingestion_failed: {
    status: 500,
    title: "Submission failed",
    description: "The server could not process the submitted audio.",
    hint: "Retry; if it persists, report it with the requestId.",
    retryable: true,
  },

  // ---- animation input ------------------------------------------------------
  audio_url_unreadable: {
    status: 422,
    title: "Unreadable audio",
    description:
      "The audio_url passed to animate.generate() could not be downloaded, or its duration could not be read. The job is priced from that duration, so it is required.",
    hint: "Check that audio_url serves the raw audio file (mp3, wav, m4a) with a 2xx response from the public internet, then call animate.generate() again.",
    retryable: false,
  },

  // ---- voices ---------------------------------------------------------------
  unknown_voice_id: {
    status: 422,
    title: "Unknown voice",
    description:
      "The voice id does not match an enabled preset or one of your custom voices.",
    hint: "Use tts.listVoices() to see the available voices.",
    retryable: false,
  },
  voice_not_ready: {
    status: 422,
    title: "Voice not ready",
    description:
      "The custom voice is still processing, failed, or is missing its reference audio.",
    hint: "Wait for the voice to finish processing in the dashboard (tts.listVoices() only lists ready clones), or pick another voice.",
    retryable: false,
  },

  // ---- credits & limits -----------------------------------------------------
  insufficient_credits: {
    status: 402,
    title: "Insufficient credits",
    description:
      "Not enough purchased credits for this request — free credits cannot be spent through the API.",
    hint: "Buy credits in the dashboard; usage.getBalance() shows the current balance.",
    retryable: false,
  },
  queue_limit_reached: {
    status: 429,
    title: "Queue limit reached",
    description: "Too many of your jobs are already waiting in the queue.",
    hint: "Wait for queued jobs to start (asr.poll(), animate.poll(), tts.poll()) before submitting more.",
    retryable: true,
  },
  concurrency_limit_reached: {
    status: 429,
    title: "Concurrency limit reached",
    description: "Your plan's maximum number of processing jobs is already running.",
    hint: 'Retry after err.retryAfter seconds, or call tts.generate() with mode: "async" and poll tts.getResult().',
    retryable: true,
  },
  stream_concurrency_limit: {
    status: 429,
    title: "Too many concurrent streams",
    description: "Your plan's concurrent-stream cap is already in use.",
    hint: "Close an active stream (connection.close()) and reconnect.",
    retryable: true,
  },
  stream_capacity: {
    status: 503,
    title: "Streaming capacity reached",
    description: "All streaming capacity is in use platform-wide.",
    hint: "Retry shortly.",
    retryable: true,
  },

  // ---- availability -----------------------------------------------------------
  tts_warming: {
    status: 503,
    title: "TTS engine warming up",
    description: "The speech engine is cold-starting.",
    hint: 'Retry in about err.retryAfter seconds, or call tts.generate() with mode: "async" and poll tts.getResult().',
    retryable: true,
  },
  streaming_unavailable: {
    status: 503,
    title: "Streaming unavailable",
    description: "Real-time streaming is not configured on this deployment.",
    hint: "Use the batch methods (asr.transcribe(), tts.generate()) or contact support.",
    retryable: false,
  },
  token_service_unavailable: {
    status: 503,
    title: "Service unavailable",
    description: "The stream-token service is temporarily unavailable.",
    hint: "Retry auth.createStreamToken() shortly.",
    retryable: true,
  },
  websocket_required: {
    status: 426,
    title: "Upgrade required",
    description: "The endpoint only accepts WebSocket connections.",
    hint: "Use asr.stream() / tts.stream(), which connect over WebSocket.",
    retryable: false,
  },

  // ---- processing ---------------------------------------------------------------
  synthesis_failed: {
    status: 500,
    title: "Synthesis failed",
    description: "The speech engine could not generate audio.",
    hint: "Retry; if it persists, report it with the requestId.",
    retryable: true,
  },
  audio_conversion_failed: {
    status: 500,
    title: "Conversion failed",
    description: "The generated audio could not be converted to the requested output_format.",
    hint: 'Retry, or request output_format: "wav".',
    retryable: true,
  },
  audio_upload_failed: {
    status: 500,
    title: "Storage failed",
    description: "The generated audio could not be stored.",
    hint: "Retry; if it persists, report it with the requestId.",
    retryable: true,
  },
  explain_failed: {
    status: 500,
    title: "Explain failed",
    description: "The explain service could not process the text.",
    hint: "Retry; if it persists, report it with the requestId.",
    retryable: true,
  },
  stream_setup_failed: {
    status: 500,
    title: "Stream setup failed",
    description: "The server could not initialise the streaming session.",
    hint: "Retry; if it persists, report it with the requestId.",
    retryable: true,
  },
  internal_error: {
    status: 500,
    title: "Internal error",
    description: "An unexpected error occurred on the server.",
    hint: "Retry; if it persists, report it with the requestId.",
    retryable: true,
  },
  not_found: {
    status: 404,
    title: "Not found",
    description: "No job with that id exists for your project.",
    hint: "Check the id — jobs are only visible to the project whose key created them.",
    retryable: false,
  },
  endpoint_not_found: {
    status: 404,
    title: "Not found",
    description: "No API endpoint matches the request.",
    hint: "Check baseUrl in new VoiceMaker({ baseUrl }) — it must be the API origin with no path.",
    retryable: false,
  },
});

/** Every error code the API can return. Unknown codes are still surfaced as `string`. */
export type ErrorCode = keyof typeof ERROR_CODES;

/**
 * Codes the SDK itself generates before or instead of a request (no HTTP
 * exchange happened). They share the `err.code` field with API codes.
 */
export const CLIENT_ERROR_CODES = define({
  api_key_required: {
    status: 0,
    title: "API key required",
    description: "This call needs an API key and the client was created without one.",
    hint: "Keep the key on your backend and pass it via new VoiceMaker({ apiKey }); browsers should stream with an ephemeral token from auth.createStreamToken() instead.",
    retryable: false,
  },
  credential_required: {
    status: 0,
    title: "Credential required",
    description: "Streaming needs an API key or an ephemeral stream token.",
    hint: "Pass apiKey to new VoiceMaker() on a backend, or mint a token there with auth.createStreamToken() and pass it as accessToken.",
    retryable: false,
  },
  websocket_unavailable: {
    status: 0,
    title: "WebSocket unavailable",
    description: "This runtime has no global WebSocket implementation.",
    hint: "Streaming needs Node >= 22, Bun, Deno or a browser.",
    retryable: false,
  },
  invalid_argument: {
    status: 0,
    title: "Invalid argument",
    description: "An argument failed client-side validation before any request was made.",
    hint: "See the message for the offending argument.",
    retryable: false,
  },
  stream_not_open: {
    status: 0,
    title: "Stream not open",
    description: "Data was sent on a stream that is not open.",
    hint: 'Wait for the "open" event (session.begin) before sending, and stop sending after close().',
    retryable: false,
  },
  network_error: {
    status: 0,
    title: "Network error",
    description: "The request never reached the API (DNS, connection refused, TLS, CORS, offline).",
    hint: "Check connectivity and baseUrl; in browsers, check the console for a CORS or mixed-content block.",
    retryable: true,
  },
  request_timeout: {
    status: 0,
    title: "Request timeout",
    description: "The API did not answer within the client's timeout.",
    hint: "Retry, or raise timeoutMs in new VoiceMaker({ timeoutMs }) for long uploads.",
    retryable: true,
  },
  poll_timeout: {
    status: 0,
    title: "Poll timeout",
    description: "The job did not reach a terminal status before the polling deadline.",
    hint: "The job is still running — call getResult() again later, or raise timeoutMs in the poll options.",
    retryable: true,
  },
});

export type ClientErrorCode = keyof typeof CLIENT_ERROR_CODES;

/**
 * Codes carried by `{ type: "error", code, message }` frames inside an open
 * streaming session (asr.stream() / tts.stream()). These arrive as "error"
 * events, not thrown exceptions, because the session may continue afterwards.
 */
export const STREAM_ERROR_CODES = define({
  invalid_message: {
    status: 0,
    title: "Invalid message",
    description: "The server received a control frame it could not parse or does not accept in the current state.",
    hint: "Only use the connection's methods (sendAudio()/sendText(), finalize(), close()); stop sending after close().",
    retryable: false,
  },
  text_too_large: {
    status: 0,
    title: "Text frame too large",
    description: "A single sendText() call exceeded the per-frame character limit.",
    hint: "Split the text with chunkText() and call sendText() per chunk.",
    retryable: false,
  },
  session_char_limit: {
    status: 0,
    title: "Session character limit",
    description: "The session's total character budget is exhausted; audio already submitted is still delivered.",
    hint: "Open a new tts.stream() session for the remaining text.",
    retryable: false,
  },
  insufficient_credits: {
    status: 0,
    title: "Insufficient credits",
    description: "Purchased credits ran out mid-session; the server delivers what was already paid for, then closes (code 4002).",
    hint: "Buy credits in the dashboard; usage.getBalance() shows the current balance.",
    retryable: false,
  },
  idle_timeout: {
    status: 0,
    title: "Idle timeout",
    description: "No audio/text or KeepAlive was received for the idle window; the session closes (code 4008).",
    hint: "Keep the default keepAliveMs, or send data at least every 30 seconds.",
    retryable: true,
  },
  upstream_unavailable: {
    status: 0,
    title: "Engine unavailable",
    description: "The speech engine behind the stream failed or is at capacity; the session closes (code 1011 or 1013).",
    hint: "Reconnect after a short delay.",
    retryable: true,
  },
  internal_error: {
    status: 0,
    title: "Internal error",
    description: "An unexpected server-side error ended the session (code 1011).",
    hint: "Reconnect; if it persists, report it with the session_id.",
    retryable: true,
  },
  upgrade_rejected: {
    status: 0,
    title: "Connection rejected",
    description:
      "The server refused the connection before the session began. Browsers and Node hide the HTTP status of a rejected WebSocket upgrade, so the exact reason is not available here.",
    hint: "Usual causes: invalid or missing credential (401), a stream token that expired or was already used (401), not enough purchased credits for the reserve block (402), the concurrent-stream cap (429), or the speech engine warming up (503). Probe the same credential over REST — e.g. usage.getBalance() — to see the exact error.",
    retryable: true,
  },
});

export type StreamErrorCode = keyof typeof STREAM_ERROR_CODES;

/** Meaning of the WebSocket close codes the streaming endpoints use. */
export const STREAM_CLOSE_CODES: Readonly<Record<number, string>> = {
  1000: "Session ended normally.",
  1006: "Connection dropped without a close frame — the upgrade was rejected, the network failed, or the server went away.",
  1011: "The speech engine or the server hit an internal error.",
  1013: "The speech engine is at capacity; reconnect after a short delay.",
  4002: "Purchased credits were exhausted.",
  4008: "Idle timeout — no data or KeepAlive for 30 seconds.",
  4009: "The session reached its maximum duration or character budget.",
};

/** Human-readable meaning of a WebSocket close code (generic text for unknown codes). */
export function describeStreamClose(code: number): string {
  return STREAM_CLOSE_CODES[code] ?? `Connection closed with code ${code}.`;
}

/**
 * Look up an API, client-side or in-session stream code. Returns undefined
 * for codes this SDK version does not know about.
 */
export function describeErrorCode(code: string): ErrorCodeInfo | undefined {
  return (
    (ERROR_CODES as Record<string, ErrorCodeInfo>)[code] ??
    (CLIENT_ERROR_CODES as Record<string, ErrorCodeInfo>)[code] ??
    (STREAM_ERROR_CODES as Record<string, ErrorCodeInfo>)[code]
  );
}

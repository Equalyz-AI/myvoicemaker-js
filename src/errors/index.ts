import {
  CLIENT_ERROR_CODES,
  describeErrorCode,
  type ClientErrorCode,
  type ErrorCode,
  type ErrorCodeInfo,
} from "./catalog.js";

export {
  CLIENT_ERROR_CODES,
  ERROR_CODES,
  STREAM_CLOSE_CODES,
  STREAM_ERROR_CODES,
  describeErrorCode,
  describeStreamClose,
} from "./catalog.js";
export type {
  ClientErrorCode,
  ErrorCode,
  ErrorCodeInfo,
  StreamErrorCode,
} from "./catalog.js";

export interface ApiErrorIssue {
  field: string;
  code: string;
  message: string;
}

/** Wire shape of every `/dev/v1` error response. */
export interface ApiErrorBody {
  error: string;
  detail: string;
  requestId?: string;
  /** Stable machine-readable discriminator, e.g. "unknown_voice_id". */
  errorCode?: string;
  issues?: ApiErrorIssue[];
}

/** Context the SDK attaches to an error it raises. */
export interface ApiErrorOptions {
  /** SDK method that made the request, e.g. "tts.generate". */
  method?: string | undefined;
  /** Seconds to wait before retrying, from the Retry-After header. */
  retryAfter?: number | undefined;
  /** Request id from the X-Request-Id header (used when the body has none). */
  requestId?: string | undefined;
  /** HTTP status, for classes that accept more than one. */
  status?: number | undefined;
}

// Server messages are written for REST consumers and reference raw endpoints.
// Rewrite those into the SDK method that wraps them so a developer reading
// the message knows exactly what to call.
const ENDPOINT_REWRITES: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?:GET\s+)?\/dev\/v1\/tts\/voices\b/g, "tts.listVoices()"],
  [/(?:GET\s+)?\/dev\/v1\/tts\/languages\b/g, "tts.listLanguages()"],
  [/(?:POST\s+)?\/dev\/v1\/auth\/stream-token\b/g, "auth.createStreamToken()"],
  [/(?:GET\s+)?\/dev\/v1\/tts\/:id\b/g, "tts.getResult()"],
  [/(?:POST\s+)?\/dev\/v1\/tts\/generate\b/g, "tts.generate()"],
  [/(?:wss?:\/\/[^\s/]*)?\/dev\/v1\/tts\/stream\b/g, "tts.stream()"],
  [/(?:wss?:\/\/[^\s/]*)?\/dev\/v1\/transcribe\/stream\b/g, "asr.stream()"],
  [/(?:GET\s+)?\/dev\/v1\/transcribe\/:job_id\b/g, "asr.getResult()"],
  [/(?:POST\s+)?\/dev\/v1\/transcribe\b/g, "asr.transcribe()"],
  [/(?:GET\s+)?\/dev\/v1\/transcriptions\b/g, "asr.list()"],
  [/(?:POST\s+)?\/dev\/v1\/animate\/generate\b/g, "animate.generate()"],
  [/(?:GET\s+)?\/dev\/v1\/animate\/:job_id\b/g, "animate.getResult()"],
  [/(?:POST\s+)?\/dev\/v1\/explain\b/g, "explain.process()"],
  [/(?:GET\s+)?\/dev\/v1\/usage\/breakdown\b/g, "usage.getBreakdown()"],
  [/(?:GET\s+)?\/dev\/v1\/usage\b/g, "usage.getBalance()"],
  [/\bmode:"async"/g, 'mode: "async"'],
];

/** Rewrite raw endpoint references in an API message into SDK method calls. */
export function rewriteEndpointReferences(text: string): string {
  let out = text;
  for (const [pattern, replacement] of ENDPOINT_REWRITES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

const SDK_METHOD_REFERENCE = /\b[a-z]+\.[A-Za-z]+\(\)/;

/**
 * Build the human-readable message for an API error:
 *
 *   tts.generate(): Unknown voice — voice_id 'foo' does not match … Use
 *   tts.listVoices() to see the available voices. [unknown_voice_id · request 8f1c2d3e]
 *
 * The catalog hint is appended only when the (rewritten) server detail does
 * not already tell the developer which SDK method to call.
 */
export function formatApiErrorMessage(input: {
  method?: string | undefined;
  status: number;
  title: string;
  detail?: string | undefined;
  code?: string | undefined;
  requestId?: string | undefined;
  hint?: string | undefined;
}): string {
  const detail = input.detail ? rewriteEndpointReferences(input.detail.trim()) : "";
  const parts: string[] = [];
  parts.push(input.method ? `${input.method}(): ${input.title}` : input.title);
  if (detail && detail !== input.title) {
    parts[0] += ` — ${detail}`;
  }
  if (input.hint && !SDK_METHOD_REFERENCE.test(detail)) {
    parts.push(input.hint);
  }
  const tag = [input.code ?? `http_${input.status}`];
  if (input.requestId) tag.push(`request ${input.requestId.slice(0, 8)}`);
  parts.push(`[${tag.join(" · ")}]`);
  return parts.join(" ");
}

function formatClientMessage(method: string | undefined, text: string, code: string): string {
  const prefix = method ? `${method}(): ` : "";
  return `${prefix}${text} [${code}]`;
}

/**
 * Base class for everything this SDK throws. `code` is always set — an API
 * code (see ERROR_CODES), a client-side code (CLIENT_ERROR_CODES), or
 * `http_<status>` for an API response without one.
 */
export class VoiceMakerError extends Error {
  /** Machine-readable code; branch on this rather than on message text. */
  readonly code: string;
  /** SDK method that raised the error (e.g. "tts.generate"), when known. */
  readonly method: string | undefined;

  constructor(
    message: string,
    options: { code?: string | undefined; method?: string | undefined; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "VoiceMakerError";
    this.code = options.code ?? "unknown";
    this.method = options.method;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Raised for every non-2xx API response. Subclasses refine by status and code. */
export class VoiceMakerAPIError extends VoiceMakerError {
  readonly status: number;
  /** Short title from the API (`error` field). */
  readonly error: string;
  /** Explanation from the API, with endpoint references rewritten to SDK methods. */
  readonly detail: string;
  /** Request id for support, from the body or the X-Request-Id header. */
  readonly requestId: string | undefined;
  /** Raw `errorCode` from the response body (undefined when the API sent none). */
  readonly errorCode: string | undefined;
  /** Field-level validation issues (400/422 only). */
  readonly issues: ApiErrorIssue[] | undefined;
  /** Seconds to wait before retrying, when the API sent Retry-After. */
  readonly retryAfter: number | undefined;
  /** Whether repeating the same call later can succeed without changes. */
  readonly retryable: boolean;
  /** What the code means, from the catalog (empty for unknown codes). */
  readonly description: string;
  /** What to do about it, in SDK terms (empty for unknown codes). */
  readonly hint: string;

  constructor(status: number, body: ApiErrorBody, options: ApiErrorOptions = {}) {
    const code = body.errorCode ?? `http_${status}`;
    const info = body.errorCode ? describeErrorCode(body.errorCode) : undefined;
    const requestId = body.requestId ?? options.requestId;
    const title = body.error || info?.title || `HTTP ${status}`;
    super(
      formatApiErrorMessage({
        method: options.method,
        status,
        title,
        detail: body.detail,
        code,
        requestId,
        hint: info?.hint,
      }),
      { code, method: options.method },
    );
    this.name = "VoiceMakerAPIError";
    this.status = status;
    this.error = title;
    this.detail = body.detail ? rewriteEndpointReferences(body.detail) : "";
    this.requestId = requestId;
    this.errorCode = body.errorCode;
    this.issues = body.issues;
    this.retryAfter = options.retryAfter;
    this.retryable = info?.retryable ?? (status === 429 || status >= 500);
    this.description = info?.description ?? "";
    this.hint = info?.hint ?? "";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 401 — missing, invalid or expired API key (or stream token). */
export class AuthenticationError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(options.status ?? 401, body, options);
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * An ephemeral stream token was rejected: invalid, expired, already used
 * (401 `invalid_stream_token`) or minted for the other stream kind
 * (403 `stream_token_kind_mismatch`). Mint a fresh one with
 * auth.createStreamToken() right before connecting.
 */
export class StreamTokenError extends AuthenticationError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(body, options);
    this.name = "StreamTokenError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 402 — not enough purchased credits. */
export class InsufficientCreditsError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(402, body, options);
    this.name = "InsufficientCreditsError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 403 — key revoked, project disabled, plan without API access, or missing scope. */
export class ForbiddenError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(403, body, options);
    this.name = "ForbiddenError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** @deprecated Renamed to {@link ForbiddenError} (same class); will be removed in 1.0. */
export const PermissionError = ForbiddenError;
/** @deprecated Renamed to {@link ForbiddenError}. */
export type PermissionError = ForbiddenError;

/** 404 — no such job for this project, or no such endpoint (check baseUrl). */
export class NotFoundError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(404, body, options);
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 413 — the audio file exceeds the plan's (or the endpoint's) size limit. */
export class FileSizeLimitError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(413, body, options);
    this.name = "FileSizeLimitError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 415 — unsupported media format or request content type. */
export class UnsupportedMediaTypeError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(415, body, options);
    this.name = "UnsupportedMediaTypeError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400/422 — the request was understood but its values were rejected; see `issues`. */
export class ValidationError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(options.status ?? 422, body, options);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * The requested language is not in the platform's (admin-configured) language
 * catalog, or is not available for the requested operation — e.g. streaming.
 * Call tts.listLanguages() for the current set.
 */
export class UnsupportedLanguageError extends ValidationError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(body, { ...options, status: options.status ?? 400 });
    this.name = "UnsupportedLanguageError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 422 `unknown_voice_id` — the voice id matches neither a preset nor one of your clones. */
export class UnknownVoiceError extends ValidationError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(body, { ...options, status: options.status ?? 422 });
    this.name = "UnknownVoiceError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 422 `voice_not_ready` — the custom voice exists but cannot synthesise yet. */
export class VoiceNotReadyError extends ValidationError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(body, { ...options, status: options.status ?? 422 });
    this.name = "VoiceNotReadyError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 429 — request rate, queue, concurrency or stream limits. `retryAfter` says how long to wait. */
export class RateLimitError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(429, body, options);
    this.name = "RateLimitError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 429 `concurrency_limit_reached` — the plan's processing-job cap is in use (sync TTS). */
export class ConcurrencyLimitError extends RateLimitError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(body, options);
    this.name = "ConcurrencyLimitError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 429 `queue_limit_reached` — too many of your jobs are already queued. */
export class QueueLimitError extends RateLimitError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(body, options);
    this.name = "QueueLimitError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 429 `stream_concurrency_limit` — the plan's concurrent-stream cap is in use. */
export class StreamConcurrencyError extends RateLimitError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(body, options);
    this.name = "StreamConcurrencyError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 503 — a dependency is temporarily unavailable; retry later (`retryAfter` when sent). */
export class ServiceUnavailableError extends VoiceMakerAPIError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(503, body, options);
    this.name = "ServiceUnavailableError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 503 `tts_warming` — the speech engine is cold-starting; retry in ~`retryAfter`s or use mode: "async". */
export class ServiceWarmingError extends ServiceUnavailableError {
  constructor(body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(body, options);
    this.name = "ServiceWarmingError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 5xx other than 503 — the server failed while processing; usually retryable. */
export class ServerError extends VoiceMakerAPIError {
  constructor(status: number, body: ApiErrorBody, options: ApiErrorOptions = {}) {
    super(status, body, options);
    this.name = "ServerError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---- client-side errors (no HTTP exchange) -------------------------------------

function clientError(
  code: ClientErrorCode,
  method: string | undefined,
  detail?: string,
): { message: string; code: ClientErrorCode; method: string | undefined } {
  const info: ErrorCodeInfo = CLIENT_ERROR_CODES[code];
  const text = detail ? `${info.title} — ${detail} ${info.hint}` : `${info.title} — ${info.description} ${info.hint}`;
  return { message: formatClientMessage(method, text, code), code, method };
}

/** The client is missing something it needs before it can make the call (API key, credential, WebSocket). */
export class ConfigurationError extends VoiceMakerError {
  constructor(code: "api_key_required" | "credential_required" | "websocket_unavailable", method?: string) {
    const built = clientError(code, method);
    super(built.message, built);
    this.name = "ConfigurationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** An argument failed validation in the SDK, before any request was made. */
export class InvalidArgumentError extends VoiceMakerError {
  /** Name of the offending argument. */
  readonly argument: string;

  constructor(argument: string, detail: string, method?: string) {
    const built = clientError("invalid_argument", method, `${argument}: ${detail}`);
    super(built.message, built);
    this.name = "InvalidArgumentError";
    this.argument = argument;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** sendAudio()/sendText() was called on a stream that is not open. */
export class StreamClosedError extends VoiceMakerError {
  constructor(method?: string) {
    const built = clientError("stream_not_open", method);
    super(built.message, built);
    this.name = "StreamClosedError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** The request never reached the API (DNS, connection refused, TLS, CORS, offline). */
export class NetworkError extends VoiceMakerError {
  constructor(method: string | undefined, cause: unknown) {
    const reason = cause instanceof Error && cause.message ? cause.message : String(cause);
    const built = clientError("network_error", method, reason);
    super(built.message, { ...built, cause });
    this.name = "NetworkError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** The API did not answer within `timeoutMs`. */
export class RequestTimeoutError extends VoiceMakerError {
  readonly timeoutMs: number;

  constructor(method: string | undefined, timeoutMs: number) {
    const built = clientError("request_timeout", method, `no response within ${timeoutMs}ms.`);
    super(built.message, built);
    this.name = "RequestTimeoutError";
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** poll() gave up before the job reached a terminal status. The job itself keeps running. */
export class PollTimeoutError extends VoiceMakerError {
  readonly jobId: string;
  readonly timeoutMs: number;

  constructor(jobId: string, timeoutMs: number, method?: string) {
    const built = clientError(
      "poll_timeout",
      method,
      `job '${jobId}' did not complete within ${timeoutMs}ms.`,
    );
    super(built.message, built);
    this.name = "PollTimeoutError";
    this.jobId = jobId;
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** @deprecated Renamed to {@link PollTimeoutError} (same class) for parity with the Python SDK; will be removed in 1.0. */
export const TimeoutError = PollTimeoutError;
/** @deprecated Renamed to {@link PollTimeoutError}. */
export type TimeoutError = PollTimeoutError;

// ---- mapping ------------------------------------------------------------------------

const CODE_CLASSES: Partial<
  Record<ErrorCode, new (body: ApiErrorBody, options: ApiErrorOptions) => VoiceMakerAPIError>
> = {
  invalid_stream_token: StreamTokenError,
  stream_token_kind_mismatch: StreamTokenError,
  unsupported_language: UnsupportedLanguageError,
  streaming_unsupported_language: UnsupportedLanguageError,
  unknown_voice_id: UnknownVoiceError,
  voice_not_ready: VoiceNotReadyError,
  concurrency_limit_reached: ConcurrencyLimitError,
  queue_limit_reached: QueueLimitError,
  stream_concurrency_limit: StreamConcurrencyError,
  tts_warming: ServiceWarmingError,
};

/**
 * Turn an API error response into the most specific error class: by
 * `errorCode` first, then by HTTP status. Unknown codes still get the
 * status-based class with the raw code on `err.code`.
 */
export function createApiError(
  status: number,
  body: ApiErrorBody,
  options: ApiErrorOptions & { retryAfterHeader?: string | null | undefined } = {},
): VoiceMakerAPIError {
  const retryAfterParsed =
    options.retryAfterHeader != null && options.retryAfterHeader !== ""
      ? Number(options.retryAfterHeader)
      : undefined;
  const opts: ApiErrorOptions = {
    method: options.method,
    requestId: options.requestId,
    retryAfter:
      options.retryAfter ??
      (retryAfterParsed !== undefined && Number.isFinite(retryAfterParsed)
        ? retryAfterParsed
        : undefined),
    status,
  };

  const byCode = body.errorCode
    ? CODE_CLASSES[body.errorCode as ErrorCode]
    : undefined;
  if (byCode) {
    return new byCode(body, opts);
  }

  switch (status) {
    case 400:
    case 422:
      return new ValidationError(body, opts);
    case 401:
      return new AuthenticationError(body, opts);
    case 402:
      return new InsufficientCreditsError(body, opts);
    case 403:
      return new ForbiddenError(body, opts);
    case 404:
      return new NotFoundError(body, opts);
    case 413:
      return new FileSizeLimitError(body, opts);
    case 415:
      return new UnsupportedMediaTypeError(body, opts);
    case 429:
      return new RateLimitError(body, opts);
    case 503:
      return new ServiceUnavailableError(body, opts);
    default:
      if (status >= 500) {
        return new ServerError(status, body, opts);
      }
      return new VoiceMakerAPIError(status, body, opts);
  }
}

/** Type guard: true for any error raised by this SDK. */
export function isVoiceMakerError(error: unknown): error is VoiceMakerError {
  return error instanceof VoiceMakerError;
}

/** Type guard: true for errors that came from an API response. */
export function isVoiceMakerAPIError(error: unknown): error is VoiceMakerAPIError {
  return error instanceof VoiceMakerAPIError;
}

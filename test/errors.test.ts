import { describe, expect, test } from "bun:test";
import {
  AuthenticationError,
  CLIENT_ERROR_CODES,
  ConcurrencyLimitError,
  ConfigurationError,
  ERROR_CODES,
  ForbiddenError,
  InsufficientCreditsError,
  InvalidArgumentError,
  NotFoundError,
  PermissionError,
  QueueLimitError,
  RateLimitError,
  STREAM_ERROR_CODES,
  ServerError,
  ServiceUnavailableError,
  ServiceWarmingError,
  StreamConcurrencyError,
  StreamTokenError,
  PollTimeoutError,
  TimeoutError,
  UnknownVoiceError,
  UnsupportedLanguageError,
  ValidationError,
  VoiceMakerAPIError,
  VoiceMakerError,
  VoiceNotReadyError,
  createApiError,
  describeErrorCode,
  describeStreamClose,
  formatApiErrorMessage,
  rewriteEndpointReferences,
  type ErrorCode,
} from "../src/index.js";

describe("catalog", () => {
  test("every API code has a status, title, description, hint and retryable flag", () => {
    for (const [code, info] of Object.entries(ERROR_CODES)) {
      expect(info.status, code).toBeGreaterThanOrEqual(400);
      expect(info.title.length, code).toBeGreaterThan(0);
      expect(info.description.length, code).toBeGreaterThan(0);
      expect(info.hint.length, code).toBeGreaterThan(0);
      expect(typeof info.retryable, code).toBe("boolean");
    }
  });

  test("hints reference SDK methods, never raw endpoints", () => {
    for (const table of [ERROR_CODES, CLIENT_ERROR_CODES, STREAM_ERROR_CODES]) {
      for (const [code, info] of Object.entries(table)) {
        expect(info.hint, code).not.toMatch(/\/dev\/v1/);
        expect(info.description, code).not.toMatch(/\/dev\/v1/);
      }
    }
  });

  test("describeErrorCode resolves API, client and stream codes", () => {
    expect(describeErrorCode("unknown_voice_id")?.status).toBe(422);
    expect(describeErrorCode("api_key_required")?.title).toBe("API key required");
    expect(describeErrorCode("idle_timeout")?.retryable).toBe(true);
    expect(describeErrorCode("nope")).toBeUndefined();
  });

  test("close codes are described", () => {
    expect(describeStreamClose(4002)).toMatch(/credits/i);
    expect(describeStreamClose(9999)).toMatch(/9999/);
  });
});

describe("rewriteEndpointReferences", () => {
  test("turns endpoint hints into SDK method calls", () => {
    expect(
      rewriteEndpointReferences(
        "Use GET /dev/v1/tts/voices for the list of available voices.",
      ),
    ).toBe("Use tts.listVoices() for the list of available voices.");
    expect(
      rewriteEndpointReferences("Mint a fresh one via POST /dev/v1/auth/stream-token."),
    ).toBe("Mint a fresh one via auth.createStreamToken().");
    expect(
      rewriteEndpointReferences(
        'Retry in ~1 minute, or submit with mode:"async" to queue the job and poll GET /dev/v1/tts/:id.',
      ),
    ).toBe(
      'Retry in ~1 minute, or submit with mode: "async" to queue the job and poll tts.getResult().',
    );
    expect(rewriteEndpointReferences("POST /dev/v1/transcribe then GET /dev/v1/transcribe/:job_id")).toBe(
      "asr.transcribe() then asr.getResult()",
    );
  });
});

describe("createApiError", () => {
  const body = (
    errorCode: string | undefined,
    extra: Partial<{ error: string; detail: string; requestId: string }> = {},
  ) => ({
    error: extra.error ?? "Some title",
    detail: extra.detail ?? "Some detail.",
    ...(errorCode ? { errorCode } : {}),
    ...(extra.requestId ? { requestId: extra.requestId } : {}),
  });

  test("maps by errorCode before status", () => {
    const cases: Array<[ErrorCode, number, Function]> = [
      ["invalid_stream_token", 401, StreamTokenError],
      ["stream_token_kind_mismatch", 403, StreamTokenError],
      ["unsupported_language", 400, UnsupportedLanguageError],
      ["streaming_unsupported_language", 400, UnsupportedLanguageError],
      ["unknown_voice_id", 422, UnknownVoiceError],
      ["voice_not_ready", 422, VoiceNotReadyError],
      ["concurrency_limit_reached", 429, ConcurrencyLimitError],
      ["queue_limit_reached", 429, QueueLimitError],
      ["stream_concurrency_limit", 429, StreamConcurrencyError],
      ["tts_warming", 503, ServiceWarmingError],
    ];
    for (const [code, status, cls] of cases) {
      const err = createApiError(status, body(code));
      expect(err, code).toBeInstanceOf(cls);
      expect(err.code).toBe(code);
      expect(err.status).toBe(status);
    }
  });

  test("code-specific classes keep their status-based parents", () => {
    expect(createApiError(401, body("invalid_stream_token"))).toBeInstanceOf(AuthenticationError);
    expect(createApiError(422, body("unknown_voice_id"))).toBeInstanceOf(ValidationError);
    expect(createApiError(429, body("queue_limit_reached"))).toBeInstanceOf(RateLimitError);
    expect(createApiError(503, body("tts_warming"))).toBeInstanceOf(ServiceUnavailableError);
  });

  test("maps by status when the code is unknown or missing", () => {
    expect(createApiError(400, body(undefined))).toBeInstanceOf(ValidationError);
    expect(createApiError(401, body("invalid_api_key"))).toBeInstanceOf(AuthenticationError);
    expect(createApiError(402, body("insufficient_credits"))).toBeInstanceOf(InsufficientCreditsError);
    expect(createApiError(403, body("insufficient_scope"))).toBeInstanceOf(ForbiddenError);
    expect(createApiError(404, body("not_found"))).toBeInstanceOf(NotFoundError);
    expect(createApiError(429, body("rate_limited"))).toBeInstanceOf(RateLimitError);
    expect(createApiError(503, body("stream_capacity"))).toBeInstanceOf(ServiceUnavailableError);
    expect(createApiError(500, body("synthesis_failed"))).toBeInstanceOf(ServerError);
    expect(createApiError(502, body(undefined))).toBeInstanceOf(ServerError);
    const odd = createApiError(418, body(undefined));
    expect(odd).toBeInstanceOf(VoiceMakerAPIError);
    expect(odd).not.toBeInstanceOf(ServerError);
    expect(odd.code).toBe("http_418");
  });

  test("unknown future codes still carry the raw code", () => {
    const err = createApiError(400, body("brand_new_code"));
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.code).toBe("brand_new_code");
    expect(err.errorCode).toBe("brand_new_code");
    expect(err.hint).toBe("");
  });

  test("PermissionError is an alias of ForbiddenError", () => {
    expect(PermissionError).toBe(ForbiddenError);
    expect(createApiError(403, body("api_key_revoked"))).toBeInstanceOf(PermissionError);
  });

  test("suspension and URL-safety codes map to their status classes", () => {
    const cases: Array<[number, ErrorCode, typeof ForbiddenError | typeof ValidationError]> = [
      [403, "account_suspended", ForbiddenError],
      [400, "file_url_host_not_allowed", ValidationError],
      [400, "invalid_webhook_url", ValidationError],
      [422, "audio_url_unreadable", ValidationError],
    ];
    for (const [status, code, cls] of cases) {
      expect(ERROR_CODES[code].status, code).toBe(status);
      const err = createApiError(status, body(code));
      expect(err, code).toBeInstanceOf(cls);
      expect(err.code, code).toBe(code);
      expect(err.hint, code).toBe(ERROR_CODES[code].hint);
      expect(err.retryable, code).toBe(false);
    }
  });

  test("parses Retry-After and marks retryable from the catalog", () => {
    const err = createApiError(429, body("rate_limited"), { retryAfterHeader: "17" });
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(17);
    expect(err.retryable).toBe(true);
    expect(createApiError(402, body("insufficient_credits")).retryable).toBe(false);
    expect(createApiError(503, body("tts_warming"), { retryAfterHeader: "60" }).retryAfter).toBe(60);
  });

  test("falls back to the X-Request-Id header when the body has none", () => {
    const err = createApiError(401, body("missing_api_key"), { requestId: "hdr-1234-5678" });
    expect(err.requestId).toBe("hdr-1234-5678");
    const bodyWins = createApiError(401, body("missing_api_key", { requestId: "body-1" }), {
      requestId: "hdr-1",
    });
    expect(bodyWins.requestId).toBe("body-1");
  });

  test("all errors are VoiceMakerError instances with a code", () => {
    for (const err of [
      createApiError(500, body(undefined)),
      new ConfigurationError("api_key_required", "tts.generate"),
      new InvalidArgumentError("language", "must be explicit", "asr.stream"),
      new PollTimeoutError("job_1", 5000, "asr.poll"),
    ]) {
      expect(err).toBeInstanceOf(VoiceMakerError);
      expect(err.code.length).toBeGreaterThan(0);
    }
  });
});

describe("messages", () => {
  test("lead with the SDK method, rewrite endpoints, end with code and request id", () => {
    const err = createApiError(
      422,
      {
        error: "Unknown voice",
        detail:
          "voice_id 'foo' does not match an enabled voice preset or one of your custom voices. Use GET /dev/v1/tts/voices for the list of available voices.",
        errorCode: "unknown_voice_id",
        requestId: "8f1c2d3e-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
      },
      { method: "tts.generate" },
    );
    expect(err.message).toBe(
      "tts.generate(): Unknown voice — voice_id 'foo' does not match an enabled voice preset or one of your custom voices. Use tts.listVoices() for the list of available voices. [unknown_voice_id · request 8f1c2d3e]",
    );
    expect(err.detail).not.toMatch(/\/dev\/v1/);
    expect(err.hint).toBe(ERROR_CODES.unknown_voice_id.hint);
  });

  test("appends the catalog hint when the server detail has no SDK guidance", () => {
    const err = createApiError(
      402,
      {
        error: "Insufficient credits",
        detail: "Not enough purchased credits. Required: 1,500 credits.",
        errorCode: "insufficient_credits",
        requestId: "abcdef12-0000",
      },
      { method: "asr.transcribe" },
    );
    expect(err.message).toBe(
      "asr.transcribe(): Insufficient credits — Not enough purchased credits. Required: 1,500 credits. Buy credits in the dashboard; usage.getBalance() shows the current balance. [insufficient_credits · request abcdef12]",
    );
  });

  test("does not duplicate a hint the rewritten detail already gives", () => {
    const err = createApiError(
      503,
      {
        error: "TTS engine warming up",
        detail:
          'The TTS engine is starting up (cold start). Retry in ~1 minute, or submit with mode:"async" to queue the job and poll GET /dev/v1/tts/:id.',
        errorCode: "tts_warming",
      },
      { method: "tts.generate", retryAfterHeader: "60" },
    );
    expect(err.message).toBe(
      'tts.generate(): TTS engine warming up — The TTS engine is starting up (cold start). Retry in ~1 minute, or submit with mode: "async" to queue the job and poll tts.getResult(). [tts_warming]',
    );
    expect(err.message.split("tts.getResult()").length).toBe(2);
  });

  test("works without a method and without a code", () => {
    expect(
      formatApiErrorMessage({ status: 502, title: "HTTP 502", detail: "Bad gateway." }),
    ).toBe("HTTP 502 — Bad gateway. [http_502]");
  });

  test("client-side errors name the method and carry a code", () => {
    const cfg = new ConfigurationError("api_key_required", "usage.getBalance");
    expect(cfg.message).toMatch(/^usage\.getBalance\(\): API key required — /);
    expect(cfg.message).toMatch(/\[api_key_required\]$/);
    expect(cfg.code).toBe("api_key_required");
    expect(cfg.method).toBe("usage.getBalance");

    const arg = new InvalidArgumentError("language", "must be explicit.", "asr.stream");
    expect(arg.message).toMatch(/^asr\.stream\(\): Invalid argument — language: must be explicit\./);
    expect(arg.argument).toBe("language");

    const t = new PollTimeoutError("job_9", 1000, "animate.poll");
    expect(t.message).toMatch(/^animate\.poll\(\): Poll timeout — job 'job_9' did not complete within 1000ms\./);
    expect(t.jobId).toBe("job_9");
    expect(TimeoutError).toBe(PollTimeoutError);
  });
});

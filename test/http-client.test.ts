import { afterEach, describe, expect, test } from "bun:test";
import {
  AuthenticationError,
  ConfigurationError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  RequestTimeoutError,
  UnknownVoiceError,
  VoiceMaker,
} from "../src/index.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

describe("HttpClient error surfacing", () => {
  test("REST error names the SDK method and maps the code", async () => {
    globalThis.fetch = (async () =>
      jsonResponse(422, {
        error: "Unknown voice",
        detail: "voice_id 'x' does not match an enabled voice preset or one of your custom voices. Use GET /dev/v1/tts/voices for the list of available voices.",
        errorCode: "unknown_voice_id",
        requestId: "req-1111-2222",
      })) as typeof fetch;
    const client = new VoiceMaker({ apiKey: "vmk_test_x" });
    const err = await client.tts.generate({ text: "hi", voice_id: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(UnknownVoiceError);
    expect(err.method).toBe("tts.generate");
    expect(err.message.startsWith("tts.generate(): Unknown voice — ")).toBe(true);
    expect(err.message).toContain("tts.listVoices()");
    expect(err.requestId).toBe("req-1111-2222");
  });

  test("uses the X-Request-Id header when the body has no requestId", async () => {
    globalThis.fetch = (async () =>
      jsonResponse(
        401,
        { error: "Unauthorized", detail: "The provided developer API key is invalid", errorCode: "invalid_api_key" },
        { "X-Request-Id": "hdr-9999-0000" },
      )) as typeof fetch;
    const client = new VoiceMaker({ apiKey: "vmk_test_x" });
    const err = await client.usage.getBalance().catch((e) => e);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.code).toBe("invalid_api_key");
    expect(err.requestId).toBe("hdr-9999-0000");
    expect(err.message).toContain("request hdr-9999");
  });

  test("parses Retry-After on 429", async () => {
    globalThis.fetch = (async () =>
      jsonResponse(
        429,
        { error: "Rate limit exceeded", detail: "Slow down.", errorCode: "rate_limited" },
        { "Retry-After": "12" },
      )) as typeof fetch;
    const client = new VoiceMaker({ apiKey: "vmk_test_x" });
    const err = await client.asr.getResult("j1").catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(12);
    expect(err.method).toBe("asr.getResult");
  });

  test("non-JSON error bodies still produce a typed error with a status code", async () => {
    globalThis.fetch = (async () =>
      new Response("<html>404</html>", { status: 404, statusText: "Not Found" })) as typeof fetch;
    const client = new VoiceMaker({ apiKey: "vmk_test_x", baseUrl: "https://wrong.example" });
    const err = await client.animate.getResult("a1").catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.code).toBe("http_404");
    expect(err.message).toBe(
      "animate.getResult(): HTTP 404 — The server answered 404 Not Found without a JSON error body. [http_404]",
    );
  });

  test("missing apiKey is a ConfigurationError naming the call", async () => {
    const client = new VoiceMaker({});
    const err = await client.tts.listVoices().catch((e) => e);
    expect(err).toBeInstanceOf(ConfigurationError);
    expect(err.code).toBe("api_key_required");
    expect(err.message.startsWith("tts.listVoices(): API key required")).toBe(true);
  });

  test("transport failures become NetworkError with the cause attached", async () => {
    const cause = new TypeError("fetch failed");
    globalThis.fetch = (async () => {
      throw cause;
    }) as typeof fetch;
    const client = new VoiceMaker({ apiKey: "vmk_test_x" });
    const err = await client.explain.process({ text: "t", language: "en", action: "explain" }).catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.code).toBe("network_error");
    expect(err.cause).toBe(cause);
    expect(err.message).toContain("explain.process(): Network error — fetch failed");
  });

  test("client timeout becomes RequestTimeoutError", async () => {
    globalThis.fetch = ((_: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as typeof fetch;
    const client = new VoiceMaker({ apiKey: "vmk_test_x", timeoutMs: 10 });
    const err = await client.usage.getBalance().catch((e) => e);
    expect(err).toBeInstanceOf(RequestTimeoutError);
    expect(err.timeoutMs).toBe(10);
    expect(err.message).toContain("usage.getBalance(): Request timeout");
  });

  test("tts.generate async mode sends mode and returns the job", async () => {
    let sent: unknown;
    globalThis.fetch = (async (_: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return jsonResponse(202, { requestId: "r", id: "v1", status: "queued", characters: 2, credits_reserved: 4, language: "en", voice_id: "x", output_format: "wav", created_at: "now" });
    }) as typeof fetch;
    const client = new VoiceMaker({ apiKey: "vmk_test_x" });
    const job = await client.tts.generate({ text: "hi", voice_id: "x", mode: "async" });
    expect((sent as { mode: string }).mode).toBe("async");
    expect(job.status).toBe("queued");
  });
});

describe("transcribeFile", () => {
  test("an unreadable file is an InvalidArgumentError naming the call", async () => {
    const { InvalidArgumentError, VoiceMaker: VM } = await import("../src/index.js");
    const client = new VM({ apiKey: "vmk_test_x" });
    const err = await client.asr.transcribeFile("/definitely/not/here.wav").catch((e) => e);
    expect(err).toBeInstanceOf(InvalidArgumentError);
    expect(err.argument).toBe("filePath");
    expect(err.message.startsWith("asr.transcribeFile(): Invalid argument — filePath: cannot read '/definitely/not/here.wav'")).toBe(true);
  });
});

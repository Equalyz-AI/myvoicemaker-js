import {
  createApiError,
  VoiceMakerError,
  type ApiErrorBody,
} from "../errors/index.js";
import type { ApiResponse, QueryParams, RateLimitHeaders } from "./types.js";

interface NodeFileHelpers {
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  basename(path: string): string;
}

/**
 * Node's fs/path are loaded lazily, and only on the file-path code path, so
 * the package stays importable in browser bundles: a top-level
 * `import "node:fs/promises"` makes webpack/Turbopack reject the whole SDK,
 * and browser code never calls postMultipart with a file path anyway.
 */
async function loadNodeFileHelpers(): Promise<NodeFileHelpers> {
  const proc = (
    globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }
  ).process;
  const getBuiltin = proc?.getBuiltinModule;
  if (typeof getBuiltin === "function") {
    const fs = getBuiltin.call(proc, "node:fs/promises") as
      | NodeFileHelpers
      | undefined;
    const path = getBuiltin.call(proc, "node:path") as
      | NodeFileHelpers
      | undefined;
    if (fs && path) {
      return {
        readFile: (p) => fs.readFile(p),
        basename: (p) => path.basename(p),
      };
    }
  }
  // Node 18-21 has no process.getBuiltinModule: go through a
  // runtime-constructed import() that bundlers cannot statically trace.
  const dynamicImport = new Function("s", "return import(s)") as (
    specifier: string,
  ) => Promise<Record<string, unknown>>;
  const [fs, path] = await Promise.all([
    dynamicImport("node:fs/promises"),
    dynamicImport("node:path"),
  ]);
  return {
    readFile: fs["readFile"] as NodeFileHelpers["readFile"],
    basename: path["basename"] as NodeFileHelpers["basename"],
  };
}

export interface HttpClientConfig {
  /**
   * Optional so browser clients can stream with ephemeral tokens only
   * (see auth.createStreamToken) — REST calls still require a key.
   */
  apiKey?: string | undefined;
  baseUrl: string;
  timeoutMs: number;
}

export class HttpClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: HttpClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs;
  }

  async get<T>(
    path: string,
    query?: QueryParams,
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, query);
    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: this.authHeaders(),
    });
    return this.parseResponse<T>(response);
  }

  async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: { ...this.authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return this.parseResponse<T>(response);
  }

  async postMultipart<T>(
    path: string,
    filePath: string,
    fields: Record<string, string | undefined>,
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    const form = new FormData();

    const { readFile, basename } = await loadNodeFileHelpers();
    const fileBuffer = await readFile(filePath);
    const fileName = basename(filePath);
    const blob = new Blob([fileBuffer]);
    form.append("audio", blob, fileName);

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        form.append(key, value);
      }
    }

    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: this.authHeaders(),
      body: form,
    });
    return this.parseResponse<T>(response);
  }

  private buildUrl(path: string, query?: QueryParams): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  /** ws(s):// form of an API URL, for the streaming endpoints. */
  buildWebSocketUrl(path: string, query?: QueryParams): string {
    return this.buildUrl(path, query).replace(/^http/i, "ws");
  }

  /** Exposed for transports (WebSocket) that cannot reuse HTTP headers. */
  getApiKey(): string | undefined {
    return this.apiKey;
  }

  private authHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new VoiceMakerError(
        "This call requires an apiKey. Keep the key on your backend and, for browser streaming, mint an ephemeral token there (auth.createStreamToken) and pass it as accessToken.",
      );
    }
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.timeoutMs,
    );

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private parseRateLimit(response: Response): RateLimitHeaders | undefined {
    const limit = response.headers.get("X-RateLimit-Limit");
    const remaining = response.headers.get("X-RateLimit-Remaining");
    const reset = response.headers.get("X-RateLimit-Reset");

    if (limit === null || remaining === null || reset === null) {
      return undefined;
    }

    return {
      limit: Number(limit),
      remaining: Number(remaining),
      reset: Number(reset),
    };
  }

  private async parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const requestId =
      response.headers.get("X-Request-Id") ?? undefined;
    const rateLimit = this.parseRateLimit(response);

    if (!response.ok) {
      let body: ApiErrorBody;
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        body = {
          error: "Unknown error",
          detail: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
      const retryAfter = response.headers.get("Retry-After");
      throw createApiError(response.status, body, retryAfter);
    }

    const data = (await response.json()) as T;
    return { data, requestId, rateLimit };
  }
}

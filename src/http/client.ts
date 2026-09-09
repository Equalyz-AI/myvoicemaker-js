import {
  ConfigurationError,
  InvalidArgumentError,
  NetworkError,
  RequestTimeoutError,
  createApiError,
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

/**
 * Thin fetch wrapper. Every request is tagged with the SDK method that made
 * it (`method`, e.g. "tts.generate") so any error names the call a developer
 * actually wrote instead of the endpoint behind it.
 */
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
    query: QueryParams | undefined,
    method: string,
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, query);
    const response = await this.fetchWithTimeout(
      url,
      { method: "GET", headers: this.authHeaders(method) },
      method,
    );
    return this.parseResponse<T>(response, method);
  }

  async post<T>(path: string, body: unknown, method: string): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    const response = await this.fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { ...this.authHeaders(method), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      method,
    );
    return this.parseResponse<T>(response, method);
  }

  async postMultipart<T>(
    path: string,
    filePath: string,
    fields: Record<string, string | undefined>,
    method: string,
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path);
    const headers = this.authHeaders(method);
    const form = new FormData();

    const { readFile, basename } = await loadNodeFileHelpers();
    let fileBuffer: Uint8Array<ArrayBuffer>;
    try {
      fileBuffer = await readFile(filePath);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new InvalidArgumentError("filePath", `cannot read '${filePath}' (${reason}).`, method);
    }
    const fileName = basename(filePath);
    const blob = new Blob([fileBuffer]);
    form.append("audio", blob, fileName);

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        form.append(key, value);
      }
    }

    const response = await this.fetchWithTimeout(
      url,
      { method: "POST", headers, body: form },
      method,
    );
    return this.parseResponse<T>(response, method);
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

  private authHeaders(method: string): Record<string, string> {
    if (!this.apiKey) {
      throw new ConfigurationError("api_key_required", method);
    }
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    method: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.timeoutMs,
    );

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new RequestTimeoutError(method, this.timeoutMs);
      }
      // fetch rejects with a TypeError for every transport-level failure
      // (DNS, refused connection, TLS, CORS); wrap it so the message names
      // the SDK call and the code is stable.
      throw new NetworkError(method, error);
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

  private async parseResponse<T>(
    response: Response,
    method: string,
  ): Promise<ApiResponse<T>> {
    const requestId =
      response.headers.get("X-Request-Id") ?? undefined;
    const rateLimit = this.parseRateLimit(response);

    if (!response.ok) {
      let body: ApiErrorBody;
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        // Non-JSON error (a proxy or CDN page, an HTML 404 from a wrong
        // baseUrl): synthesise the standard shape so the error still names
        // the call and carries a code.
        body = {
          error: `HTTP ${response.status}`,
          detail: response.statusText
            ? `The server answered ${response.status} ${response.statusText} without a JSON error body.`
            : `The server answered ${response.status} without a JSON error body.`,
        };
      }
      throw createApiError(response.status, body, {
        method,
        requestId,
        retryAfterHeader: response.headers.get("Retry-After"),
      });
    }

    const data = (await response.json()) as T;
    return { data, requestId, rateLimit };
  }
}

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createApiError, type ApiErrorBody } from "../errors/index.js";
import type { ApiResponse, QueryParams, RateLimitHeaders } from "./types.js";

export interface HttpClientConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

export class HttpClient {
  private readonly apiKey: string;
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

  private authHeaders(): Record<string, string> {
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

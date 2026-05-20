export interface RateLimitHeaders {
  limit: number;
  remaining: number;
  reset: number;
}

export interface ApiResponse<T> {
  data: T;
  requestId: string | undefined;
  rateLimit: RateLimitHeaders | undefined;
}

export interface RequestConfig {
  timeoutMs: number;
  headers?: Record<string, string>;
}

export type QueryParams = Record<
  string,
  string | number | boolean | undefined
>;

export type SupportedLanguage =
  | "yo"
  | "ig"
  | "ha"
  | "pcm"
  | "en"
  | "auto";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export type OutputAudioFormat = "mp3" | "wav" | "ogg";

export type OutputVideoFormat = "mp4" | "webm";

export type AccountTier =
  | "free"
  | "starter"
  | "growth"
  | "pro"
  | "enterprise";

export type UsageModule = "tts" | "asr" | "animate" | "explain";

export interface PaginatedResponse<T> {
  requestId: string;
  items: T[];
  nextCursor: string | null;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

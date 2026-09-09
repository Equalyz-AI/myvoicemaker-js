/**
 * Language codes known at the time this SDK version was released. The live
 * set is configured by platform admins and can change at runtime — discover
 * it with `client.tts.listLanguages()`.
 */
export type KnownLanguage =
  | "yo"
  | "ig"
  | "ha"
  | "pcm"
  | "en"
  | "auto";

/**
 * Any language code the platform currently supports. Kept open (`string`)
 * because the catalog is server-configured; the `KnownLanguage` union is
 * preserved purely for editor autocomplete.
 */
export type SupportedLanguage = KnownLanguage | (string & {});

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

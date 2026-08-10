/** Which streaming endpoint an ephemeral token may open. */
export type StreamTokenType = "asr" | "tts";

export interface CreateStreamTokenParams {
  /** Stream kind the token is scoped to. */
  type: StreamTokenType;
  /** Token lifetime in seconds (10–300, default 60). */
  expiresIn?: number;
}

export interface StreamTokenResponse {
  /** Single-use ephemeral token (`vmst_…`). Pass as `accessToken` when streaming. */
  token: string;
  /** ISO-8601 expiry timestamp. */
  expires_at: string;
  /** Lifetime the server applied, in seconds. */
  expires_in: number;
  type: StreamTokenType;
}

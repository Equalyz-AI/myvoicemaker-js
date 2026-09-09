import type { StreamErrorCode } from "../errors/catalog.js";

export interface TtsStreamParams {
  /** Preset voice id (see tts.listVoices()) or one of your custom voice ids. */
  voiceId: string;
  /** "auto" (default, multilingual) or "ha" (Hausa fine-tune). */
  language?: string;
  /** Speaking speed, 0.5–2.0. Fixed for the whole session. */
  speed?: number;
  /**
   * "standard" (default): lower latency per chunk. "high": more diffusion
   * steps per chunk for maximum quality at roughly double the chunk latency.
   */
  quality?: "standard" | "high";
  /**
   * Ephemeral stream token (`vmst_…`) minted by your backend via
   * auth.createStreamToken({ type: "tts" }). Recommended for browsers — lets
   * the client stream without ever holding the API key.
   */
  accessToken?: string;
  /** See AsrStreamConnectionOptions.useSubprotocolAuth. Default: true. */
  useSubprotocolAuth?: boolean;
  /** KeepAlive interval while the socket is open; 0 disables. Default 10s. */
  keepAliveMs?: number;
}

export interface TtsSessionBegin {
  type: "session.begin";
  session_id: string;
  request_id: string;
  language: string;
  voice_id: string;
  /** Always 24000 in v1. */
  sample_rate: number;
  /** Always "pcm_s16le" (raw 16-bit little-endian mono PCM) in v1. */
  encoding: string;
  quality: string;
  speed: number;
  credits_per_character: number;
  max_session_characters: number;
  max_duration_seconds: number;
}

export interface TtsChunkStart {
  type: "chunk.start";
  /** Session-global chunk index (0, 1, 2, ...). */
  index: number;
  /** Echo of the `id` you passed to sendText() for the text this chunk starts with. */
  submission_id: string | null;
  /** The exact text this chunk synthesizes. */
  text: string;
  characters: number;
  credits: number;
}

export interface TtsChunkEnd {
  type: "chunk.end";
  index: number;
  submission_id: string | null;
  characters: number;
  credits: number;
  duration_seconds: number;
  audio_bytes: number | null;
}

export interface TtsSessionEnd {
  type: "session.end";
  session_id: string;
  total_characters: number;
  credits_used: number;
  duration_seconds: number;
  chunks: number;
  reason:
    | "client_close"
    | "idle_timeout"
    | "max_duration"
    | "max_characters"
    | "insufficient_credits"
    | "error"
    | "server_shutdown";
}

/**
 * Protocol-level error reported during a session. The session may continue
 * (invalid_message, text_too_large) or be closing (session_char_limit,
 * insufficient_credits, idle_timeout) — see STREAM_ERROR_CODES.
 * `upgrade_rejected` is synthesised by the SDK when the socket closes before
 * session.begin.
 */
export interface TtsStreamErrorEvent {
  type: "error";
  code: StreamErrorCode | (string & {});
  message: string;
}

/** One binary PCM frame, tagged with the chunk it belongs to. */
export interface TtsAudioChunk {
  index: number;
  data: Uint8Array;
}

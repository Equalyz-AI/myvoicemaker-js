import type { JobStatus, SupportedLanguage } from "./common.js";
import type { StreamErrorCode } from "../errors/catalog.js";

export interface TranscribeUrlParams {
  audio: string;
  language?: SupportedLanguage;
  webhookUrl?: string;
}

/** Streaming requires an explicit language — auto-detection is batch-only. */
export type StreamLanguage = Exclude<SupportedLanguage, "auto">;

export interface StreamTranscriptionParams {
  language: StreamLanguage;
  /** Sample rate of the PCM16LE mono audio you will send. Default 16000. */
  sampleRate?: number;
  /** Emit interim (revisable) transcripts as well as finals. Default true. */
  interimResults?: boolean;
  /**
   * Ephemeral stream token (`vmst_…`) minted by your backend via
   * auth.createStreamToken({ type: "asr" }). Recommended for browsers — lets
   * the client stream without ever holding the API key. Single-use and
   * short-lived: mint immediately before connecting.
   */
  accessToken?: string;
  /**
   * Authenticate via the Sec-WebSocket-Protocol channel (default, works in
   * every runtime). Set false to use ?api_key= in the URL instead.
   */
  useSubprotocolAuth?: boolean;
  /** KeepAlive interval in ms while the stream is open; 0 disables. Default 10000. */
  keepAliveMs?: number;
}

export interface StreamSessionBegin {
  type: "session.begin";
  session_id: string;
  request_id: string;
  language: string;
  sample_rate: number;
  encoding: "linear16";
  interim_results: boolean;
  max_duration_seconds: number;
  credits_per_second: number;
}

export interface StreamTranscriptEvent {
  type: "transcript";
  text: string;
  /** Interims (false) may be revised by later events; finals never change. */
  is_final: boolean;
  start: number | null;
  end: number | null;
  confidence: number | null;
}

export interface StreamSessionEnd {
  type: "session.end";
  session_id: string;
  duration_seconds: number;
  credits_used: number;
  reason:
    | "client_close"
    | "idle_timeout"
    | "max_duration"
    | "insufficient_credits"
    | "error"
    | "server_shutdown";
}

/**
 * Protocol-level error reported during a session. The session may continue
 * (e.g. invalid_message) or be closing (idle_timeout, insufficient_credits) —
 * see STREAM_ERROR_CODES for the meaning of each code. `upgrade_rejected` is
 * synthesised by the SDK when the socket closes before session.begin.
 */
export interface StreamErrorEvent {
  type: "error";
  code: StreamErrorCode | (string & {});
  message: string;
}

export interface TranscribeFileParams {
  language?: SupportedLanguage;
  webhookUrl?: string;
}

export interface ListTranscriptionsParams {
  limit?: number;
  cursor?: string;
  status?: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
}

export interface TranscriptionJob {
  requestId: string;
  job_id: string;
  status: JobStatus;
  language: string;
  detected_language: string | null;
  text: string | null;
  confidence: number | null;
  duration_seconds: number | null;
  credits_used: number | null;
  created_at: string;
  completed_at: string | null;
}

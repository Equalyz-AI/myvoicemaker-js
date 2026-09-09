import type { JobStatus, OutputAudioFormat, SupportedLanguage } from "./common.js";

export interface ListVoicesParams {
  language?: SupportedLanguage;
}

export interface Voice {
  id: string;
  name: string;
  /** Presets are "male" | "female"; custom voices may carry other values. */
  gender: string;
  language: string;
  style: string;
  sample_url: string;
  /**
   * "preset" for catalog voices, "custom" for your own cloned voices
   * (created with Clone For Me in the web app).
   */
  type: "preset" | "custom";
}

export interface VoiceListResponse {
  voices: Voice[];
}

/**
 * "sync" (default) synthesises inline and returns the audio URL; "async"
 * queues the job (cold-start safe, never hits the concurrency cap) and
 * returns a TtsJobResponse to poll with tts.getResult() / tts.poll().
 */
export type TtsMode = "sync" | "async";

export interface TtsGenerateParams {
  text: string;
  /** Preset voice id (see tts.listVoices()) or one of your custom voice ids. */
  voice_id: string;
  /**
   * Language code (see tts.listLanguages()). Omitted → the platform's
   * default language.
   */
  language?: SupportedLanguage;
  speed?: number;
  /** Delivered audio format: "wav" (default), "mp3" or "ogg". */
  output_format?: OutputAudioFormat;
  /** See TtsMode. Default "sync". */
  mode?: TtsMode;
}

export interface TtsLanguage {
  /** Pass this as `language` in tts.generate() / tts.stream(). */
  code: string;
  label: string;
  /** Whether voice selection/cloning is currently available for this language. */
  supports_voice_clone: boolean;
  supports_tone: boolean;
  supports_speed: boolean;
  /** Whether tts.stream() accepts this language. */
  streaming_supported: boolean;
}

export interface TtsLanguageListResponse {
  /** Code that requests without a language resolve to. */
  default_language: string;
  languages: TtsLanguage[];
}

/** Result of tts.generate() in the default sync mode. */
export interface TtsGenerateResponse {
  requestId: string;
  id: string;
  audio_url: string;
  duration_seconds: number | null;
  characters: number;
  credits_used: number;
  language: string;
  voice_id: string;
  /** Delivered audio format: "wav", "mp3" or "ogg". */
  output_format: OutputAudioFormat;
  created_at: string;
}

/** Result of tts.generate({ mode: "async" }): the queued job. */
export interface TtsJobResponse {
  requestId: string;
  id: string;
  status: "queued";
  characters: number;
  /** Credits reserved for the job; settled to the real cost on completion. */
  credits_reserved: number;
  language: string;
  voice_id: string;
  output_format: OutputAudioFormat;
  created_at: string;
}

/** Result of tts.getResult() / tts.poll(). audio_url is set once status is "completed". */
export interface TtsResultResponse {
  requestId: string;
  id: string;
  status: JobStatus;
  audio_url: string | null;
  duration_seconds: number | null;
  characters: number | null;
  credits_used: number | null;
  language: string;
  voice_id: string;
  output_format: OutputAudioFormat;
  /** Failure message when status is "failed". */
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

import type { OutputAudioFormat, SupportedLanguage } from "./common.js";

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

export interface TtsGenerateParams {
  text: string;
  /** Preset voice id (see tts.listVoices()) or one of your custom voice ids. */
  voice_id: string;
  language: SupportedLanguage;
  speed?: number;
  /** Delivered audio format: "wav" (default), "mp3" or "ogg". */
  output_format?: OutputAudioFormat;
}

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

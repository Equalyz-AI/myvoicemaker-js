import type { OutputAudioFormat, SupportedLanguage } from "./common.js";

export interface ListVoicesParams {
  language?: SupportedLanguage;
}

export interface Voice {
  id: string;
  name: string;
  gender: "male" | "female";
  language: string;
  style: string;
  sample_url: string;
}

export interface VoiceListResponse {
  voices: Voice[];
}

export interface TtsGenerateParams {
  text: string;
  voice_id: string;
  language: SupportedLanguage;
  speed?: number;
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
  created_at: string;
}

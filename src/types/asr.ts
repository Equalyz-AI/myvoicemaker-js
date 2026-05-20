import type { JobStatus, SupportedLanguage } from "./common.js";

export interface TranscribeUrlParams {
  audio: string;
  language?: SupportedLanguage;
  webhookUrl?: string;
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

import type { JobStatus, OutputVideoFormat } from "./common.js";

export interface AnimateGenerateParams {
  image_url: string;
  audio_url: string;
  output_format?: OutputVideoFormat;
}

export interface AnimateJobResponse {
  requestId: string;
  job_id: string;
  status: "queued";
  estimated_credits: number;
  created_at: string;
}

export interface AnimateResultResponse {
  requestId: string;
  job_id: string;
  status: JobStatus;
  video_url: string | null;
  duration_seconds: number | null;
  credits_used: number | null;
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

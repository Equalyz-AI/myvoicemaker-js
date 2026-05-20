export { VoiceMaker } from "./client.js";
export type { VoiceMakerConfig } from "./client.js";

export type {
  SupportedLanguage,
  JobStatus,
  OutputAudioFormat,
  OutputVideoFormat,
  AccountTier,
  UsageModule,
  PaginatedResponse,
  PollOptions,
  TranscribeUrlParams,
  TranscribeFileParams,
  ListTranscriptionsParams,
  TranscriptionJob,
  ListVoicesParams,
  Voice,
  VoiceListResponse,
  TtsGenerateParams,
  TtsGenerateResponse,
  AnimateGenerateParams,
  AnimateJobResponse,
  AnimateResultResponse,
  ExplainAction,
  ExplainParams,
  ExplainResponse,
  UsageBalanceResponse,
  UsageBreakdownParams,
  UsageBreakdownEntry,
  UsageBreakdownResponse,
} from "./types/index.js";

export {
  VoiceMakerError,
  VoiceMakerAPIError,
  AuthenticationError,
  InsufficientCreditsError,
  PermissionError,
  NotFoundError,
  FileSizeLimitError,
  UnsupportedMediaTypeError,
  ValidationError,
  RateLimitError,
  ServerError,
  TimeoutError,
} from "./errors/index.js";

export type { ApiErrorIssue, ApiErrorBody } from "./errors/index.js";

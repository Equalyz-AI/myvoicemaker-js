export { VoiceMaker } from "./client.js";
export type { VoiceMakerConfig } from "./client.js";

export type {
  StreamTokenType,
  CreateStreamTokenParams,
  StreamTokenResponse,
} from "./types/auth.js";

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
  StreamLanguage,
  StreamTranscriptionParams,
  StreamSessionBegin,
  StreamTranscriptEvent,
  StreamSessionEnd,
  StreamErrorEvent,
  ListVoicesParams,
  Voice,
  VoiceListResponse,
  TtsGenerateParams,
  TtsGenerateResponse,
  TtsStreamParams,
  TtsSessionBegin,
  TtsChunkStart,
  TtsChunkEnd,
  TtsSessionEnd,
  TtsStreamErrorEvent,
  TtsAudioChunk,
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

export { AsrStreamConnection } from "./ws/stream-connection.js";
export type {
  AsrStreamEvents,
  AsrStreamConnectionOptions,
} from "./ws/stream-connection.js";

export { TtsStreamConnection } from "./ws/tts-stream-connection.js";
export type {
  TtsStreamEvents,
  TtsStreamConnectionOptions,
} from "./ws/tts-stream-connection.js";

export { chunkText } from "./utils/text-chunker.js";
export type { ChunkTextOptions } from "./utils/text-chunker.js";

export { createPcmPlayer } from "./audio/pcm-player.js";
export type { PcmPlayer, PcmPlayerOptions } from "./audio/pcm-player.js";

export { pcmChunksToWav } from "./audio/wav.js";
export type { PcmChunksToWavOptions } from "./audio/wav.js";

import { BaseModule } from "./base.js";
import { poll } from "../utils/poll.js";
import { InvalidArgumentError } from "../errors/index.js";
import { AsrStreamConnection } from "../ws/stream-connection.js";
import type {
  ListTranscriptionsParams,
  StreamTranscriptionParams,
  TranscribeFileParams,
  TranscribeUrlParams,
  TranscriptionJob,
} from "../types/asr.js";
import type { PaginatedResponse, PollOptions } from "../types/common.js";
import type { QueryParams } from "../http/types.js";

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

export class ASRModule extends BaseModule {
  async transcribe(params: TranscribeUrlParams): Promise<TranscriptionJob> {
    const body: Record<string, unknown> = { audio: params.audio };
    if (params.language !== undefined) body["language"] = params.language;
    if (params.webhookUrl !== undefined) body["webhookUrl"] = params.webhookUrl;

    const { data } = await this.http.post<TranscriptionJob>(
      "/dev/v1/transcribe",
      body,
      "asr.transcribe",
    );
    return data;
  }

  async transcribeFile(
    filePath: string,
    params?: TranscribeFileParams,
  ): Promise<TranscriptionJob> {
    const fields: Record<string, string | undefined> = {
      language: params?.language,
      webhook_url: params?.webhookUrl,
    };

    const { data } = await this.http.postMultipart<TranscriptionJob>(
      "/dev/v1/transcribe",
      filePath,
      fields,
      "asr.transcribeFile",
    );
    return data;
  }

  async getResult(jobId: string): Promise<TranscriptionJob> {
    const { data } = await this.http.get<TranscriptionJob>(
      `/dev/v1/transcribe/${encodeURIComponent(jobId)}`,
      undefined,
      "asr.getResult",
    );
    return data;
  }

  async list(
    params?: ListTranscriptionsParams,
  ): Promise<PaginatedResponse<TranscriptionJob>> {
    const query: QueryParams = {};
    if (params?.limit !== undefined) query["limit"] = params.limit;
    if (params?.cursor !== undefined) query["cursor"] = params.cursor;
    if (params?.status !== undefined) query["status"] = params.status;

    const { data } = await this.http.get<PaginatedResponse<TranscriptionJob>>(
      "/dev/v1/transcriptions",
      query,
      "asr.list",
    );
    return data;
  }

  async poll(
    jobId: string,
    options?: PollOptions,
  ): Promise<TranscriptionJob> {
    return poll(
      jobId,
      () => this.getResult(jobId),
      (result) => TERMINAL_STATUSES.has(result.status),
      options,
      "asr.poll",
    );
  }

  /**
   * Open a real-time streaming transcription session (WebSocket).
   * Send PCM16LE mono audio with sendAudio(); transcripts arrive via
   * on("transcript", ...) with interim results followed by stable finals.
   * Requires a global WebSocket (browsers, Node >= 22, Bun, Deno).
   */
  stream(params: StreamTranscriptionParams): AsrStreamConnection {
    if (!params.language || (params.language as string) === "auto") {
      throw new InvalidArgumentError(
        "language",
        "streaming needs an explicit language code (auto-detection is batch-only); pick one from tts.listLanguages() such as \"en\", \"yo\", \"ha\", \"ig\" or \"pcm\".",
        "asr.stream",
      );
    }
    const url = this.http.buildWebSocketUrl("/dev/v1/transcribe/stream", {
      language: params.language,
      sample_rate: params.sampleRate ?? 16000,
      interim_results: params.interimResults ?? true,
    });
    return new AsrStreamConnection({
      url,
      apiKey: this.http.getApiKey(),
      accessToken: params.accessToken,
      useSubprotocolAuth: params.useSubprotocolAuth,
      keepAliveMs: params.keepAliveMs,
      method: "asr.stream",
    });
  }
}

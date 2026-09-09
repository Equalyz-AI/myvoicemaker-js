import { BaseModule } from "./base.js";
import { poll } from "../utils/poll.js";
import type {
  ListVoicesParams,
  TtsGenerateParams,
  TtsGenerateResponse,
  TtsJobResponse,
  TtsLanguageListResponse,
  TtsResultResponse,
  VoiceListResponse,
} from "../types/tts.js";
import type { PollOptions } from "../types/common.js";
import type { TtsStreamParams } from "../types/tts-stream.js";
import type { QueryParams } from "../http/types.js";
import { TtsStreamConnection } from "../ws/tts-stream-connection.js";

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

export class TTSModule extends BaseModule {
  /**
   * List the languages the platform currently supports for synthesis. The
   * set is admin-configured and can change at runtime — prefer this over
   * hardcoding language codes.
   */
  async listLanguages(): Promise<TtsLanguageListResponse> {
    const { data } = await this.http.get<TtsLanguageListResponse>(
      "/dev/v1/tts/languages",
      undefined,
      "tts.listLanguages",
    );
    return data;
  }

  async listVoices(params?: ListVoicesParams): Promise<VoiceListResponse> {
    const query: QueryParams = {};
    if (params?.language !== undefined) {
      query["language"] = params.language;
    }
    const { data } = await this.http.get<VoiceListResponse>(
      "/dev/v1/tts/voices",
      query,
      "tts.listVoices",
    );
    return data;
  }

  /**
   * Synthesise text. Default (sync) mode returns the audio URL directly.
   * Pass `mode: "async"` to queue the job instead — it never hits the
   * concurrency cap and survives engine cold starts; poll it with
   * tts.getResult() or tts.poll().
   */
  generate(params: TtsGenerateParams & { mode: "async" }): Promise<TtsJobResponse>;
  generate(params: TtsGenerateParams & { mode?: "sync" }): Promise<TtsGenerateResponse>;
  generate(params: TtsGenerateParams): Promise<TtsGenerateResponse | TtsJobResponse>;
  async generate(
    params: TtsGenerateParams,
  ): Promise<TtsGenerateResponse | TtsJobResponse> {
    const body: Record<string, unknown> = {
      text: params.text,
      voice_id: params.voice_id,
    };
    // Omitted → the server resolves the platform's default language.
    if (params.language !== undefined) body["language"] = params.language;
    if (params.speed !== undefined) body["speed"] = params.speed;
    if (params.output_format !== undefined) {
      body["output_format"] = params.output_format;
    }
    if (params.mode !== undefined) body["mode"] = params.mode;

    const { data } = await this.http.post<TtsGenerateResponse | TtsJobResponse>(
      "/dev/v1/tts/generate",
      body,
      "tts.generate",
    );
    return data;
  }

  /** Fetch the state of a job created with tts.generate({ mode: "async" }). */
  async getResult(id: string): Promise<TtsResultResponse> {
    const { data } = await this.http.get<TtsResultResponse>(
      `/dev/v1/tts/${encodeURIComponent(id)}`,
      undefined,
      "tts.getResult",
    );
    return data;
  }

  /** Poll an async TTS job until it completes or fails. */
  async poll(id: string, options?: PollOptions): Promise<TtsResultResponse> {
    return poll(
      id,
      () => this.getResult(id),
      (result) => TERMINAL_STATUSES.has(result.status),
      options,
      "tts.poll",
    );
  }

  /**
   * Open a real-time streaming synthesis session (wss /dev/v1/tts/stream).
   * Audio starts arriving while later text is still generating — send text
   * with sendText(), play with createPcmPlayer() (browser) or collect via
   * audioChunks() + pcmChunksToWav() (Node).
   */
  stream(params: TtsStreamParams): TtsStreamConnection {
    const query: QueryParams = { voice_id: params.voiceId };
    if (params.language !== undefined) query["language"] = params.language;
    if (params.speed !== undefined) query["speed"] = params.speed;
    if (params.quality !== undefined) query["quality"] = params.quality;
    const url = this.http.buildWebSocketUrl("/dev/v1/tts/stream", query);
    return new TtsStreamConnection({
      url,
      apiKey: this.http.getApiKey(),
      accessToken: params.accessToken,
      useSubprotocolAuth: params.useSubprotocolAuth,
      keepAliveMs: params.keepAliveMs,
      method: "tts.stream",
    });
  }
}

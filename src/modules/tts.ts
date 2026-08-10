import { BaseModule } from "./base.js";
import type {
  ListVoicesParams,
  TtsGenerateParams,
  TtsGenerateResponse,
  VoiceListResponse,
} from "../types/tts.js";
import type { TtsStreamParams } from "../types/tts-stream.js";
import type { QueryParams } from "../http/types.js";
import { TtsStreamConnection } from "../ws/tts-stream-connection.js";

export class TTSModule extends BaseModule {
  async listVoices(params?: ListVoicesParams): Promise<VoiceListResponse> {
    const query: QueryParams = {};
    if (params?.language !== undefined) {
      query["language"] = params.language;
    }
    const { data } = await this.http.get<VoiceListResponse>(
      "/dev/v1/tts/voices",
      query,
    );
    return data;
  }

  async generate(params: TtsGenerateParams): Promise<TtsGenerateResponse> {
    const body: Record<string, unknown> = {
      text: params.text,
      voice_id: params.voice_id,
      language: params.language,
    };
    if (params.speed !== undefined) body["speed"] = params.speed;
    if (params.output_format !== undefined) {
      body["output_format"] = params.output_format;
    }

    const { data } = await this.http.post<TtsGenerateResponse>(
      "/dev/v1/tts/generate",
      body,
    );
    return data;
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
    });
  }
}

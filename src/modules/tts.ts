import { BaseModule } from "./base.js";
import type {
  ListVoicesParams,
  TtsGenerateParams,
  TtsGenerateResponse,
  VoiceListResponse,
} from "../types/tts.js";
import type { QueryParams } from "../http/types.js";

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
}

import { BaseModule } from "./base.js";
import { poll } from "../utils/poll.js";
import type {
  AnimateGenerateParams,
  AnimateJobResponse,
  AnimateResultResponse,
} from "../types/animate.js";
import type { PollOptions } from "../types/common.js";

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

export class AnimateModule extends BaseModule {
  async generate(params: AnimateGenerateParams): Promise<AnimateJobResponse> {
    const body: Record<string, unknown> = {
      image_url: params.image_url,
      audio_url: params.audio_url,
    };
    if (params.output_format !== undefined) {
      body["output_format"] = params.output_format;
    }

    const { data } = await this.http.post<AnimateJobResponse>(
      "/dev/v1/animate/generate",
      body,
    );
    return data;
  }

  async getResult(jobId: string): Promise<AnimateResultResponse> {
    const { data } = await this.http.get<AnimateResultResponse>(
      `/dev/v1/animate/${jobId}`,
    );
    return data;
  }

  async poll(
    jobId: string,
    options?: PollOptions,
  ): Promise<AnimateResultResponse> {
    return poll(
      jobId,
      () => this.getResult(jobId),
      (result) => TERMINAL_STATUSES.has(result.status),
      options,
    );
  }
}

import { BaseModule } from "./base.js";
import type { ExplainParams, ExplainResponse } from "../types/explain.js";

export class ExplainModule extends BaseModule {
  async process(params: ExplainParams): Promise<ExplainResponse> {
    const body: Record<string, unknown> = {
      text: params.text,
      language: params.language,
      action: params.action,
    };
    if (params.target_language !== undefined) {
      body["target_language"] = params.target_language;
    }
    if (params.max_tokens !== undefined) {
      body["max_tokens"] = params.max_tokens;
    }

    const { data } = await this.http.post<ExplainResponse>(
      "/dev/v1/explain",
      body,
    );
    return data;
  }
}

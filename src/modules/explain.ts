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
    if (params.max_words !== undefined) {
      body["max_words"] = params.max_words;
    }

    const { data } = await this.http.post<ExplainResponse>(
      "/dev/v1/explain",
      body,
      "explain.process",
    );
    return data;
  }
}

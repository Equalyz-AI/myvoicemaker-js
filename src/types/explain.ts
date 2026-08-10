import type { SupportedLanguage } from "./common.js";

export type ExplainAction =
  | "explain"
  | "summarize"
  | "translate"
  | "simplify";

export interface ExplainParams {
  text: string;
  language: SupportedLanguage;
  action: ExplainAction;
  target_language?: SupportedLanguage;
  /**
   * Soft target for response length in words (default 250, max 1000). Not a hard
   * cap — the response lands close to this value and always completes its
   * sentences. Billing meters real tokens, so the same `max_words` costs more
   * credits for Nigerian languages (yo/ig/ha) than for English.
   */
  max_words?: number;
}

export interface ExplainResponse {
  id: string;
  action: ExplainAction;
  language: string;
  result: string;
  tokens_used: number;
  credits_used: number;
  created_at: string;
}

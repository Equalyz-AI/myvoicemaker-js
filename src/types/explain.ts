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
  max_tokens?: number;
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

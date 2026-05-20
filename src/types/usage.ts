import type { AccountTier, UsageModule } from "./common.js";

export interface UsageBalanceResponse {
  account_id: string;
  tier: AccountTier;
  credits_remaining: number;
  credits_used: number;
  credits_total?: number;
  credits_expire: string | null;
  created_at: string;
}

export interface UsageBreakdownParams {
  start_date: string;
  end_date: string;
  module?: UsageModule;
}

export interface UsageBreakdownEntry {
  module: UsageModule;
  requests: number;
  credits_used: number;
}

export interface UsageBreakdownResponse {
  breakdown: UsageBreakdownEntry[];
  total_requests: number;
  total_credits_used: number;
}

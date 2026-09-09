import { BaseModule } from "./base.js";
import type {
  UsageBalanceResponse,
  UsageBreakdownParams,
  UsageBreakdownResponse,
} from "../types/usage.js";
import type { QueryParams } from "../http/types.js";

export class UsageModule extends BaseModule {
  async getBalance(): Promise<UsageBalanceResponse> {
    const { data } = await this.http.get<UsageBalanceResponse>(
      "/dev/v1/usage",
      undefined,
      "usage.getBalance",
    );
    return data;
  }

  async getBreakdown(
    params: UsageBreakdownParams,
  ): Promise<UsageBreakdownResponse> {
    const query: QueryParams = {
      start_date: params.start_date,
      end_date: params.end_date,
    };
    if (params.module !== undefined) query["module"] = params.module;

    const { data } = await this.http.get<UsageBreakdownResponse>(
      "/dev/v1/usage/breakdown",
      query,
      "usage.getBreakdown",
    );
    return data;
  }
}

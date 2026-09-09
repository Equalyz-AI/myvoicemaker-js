import { BaseModule } from "./base.js";
import type {
  CreateStreamTokenParams,
  StreamTokenResponse,
} from "../types/auth.js";

export class AuthModule extends BaseModule {
  /**
   * Mints a short-lived, single-use stream token so an untrusted client (a
   * browser, a mobile app) can open a streaming WebSocket without ever
   * holding your API key.
   *
   * Call this on your backend right before the client connects, hand the
   * token to the client, and have it connect with `accessToken` instead of
   * an apiKey:
   *
   * ```ts
   * // backend
   * const { token } = await server.auth.createStreamToken({ type: "asr" });
   * // browser
   * const client = new VoiceMaker({ baseUrl });
   * const conn = client.asr.stream({ language: "en", accessToken: token });
   * ```
   */
  async createStreamToken(
    params: CreateStreamTokenParams,
  ): Promise<StreamTokenResponse> {
    const response = await this.http.post<StreamTokenResponse>(
      "/dev/v1/auth/stream-token",
      {
        type: params.type,
        expires_in: params.expiresIn,
      },
      "auth.createStreamToken",
    );
    return response.data;
  }
}

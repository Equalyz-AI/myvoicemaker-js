import { HttpClient } from "./http/client.js";
import { ASRModule } from "./modules/asr.js";
import { TTSModule } from "./modules/tts.js";
import { AnimateModule } from "./modules/animate.js";
import { AuthModule } from "./modules/auth.js";
import { ExplainModule } from "./modules/explain.js";
import { UsageModule } from "./modules/usage.js";

export interface VoiceMakerConfig {
  /**
   * Developer API key. Optional: a browser client that only opens streaming
   * sessions with ephemeral tokens (see auth.createStreamToken) needs no key —
   * REST calls without one throw a descriptive error instead.
   */
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.myvoicemaker.ai";
const DEFAULT_TIMEOUT_MS = 30_000;

export class VoiceMaker {
  readonly auth: AuthModule;
  readonly tts: TTSModule;
  readonly asr: ASRModule;
  readonly animate: AnimateModule;
  readonly explain: ExplainModule;
  readonly usage: UsageModule;

  constructor(config: VoiceMakerConfig = {}) {
    const http = new HttpClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    this.auth = new AuthModule(http);
    this.tts = new TTSModule(http);
    this.asr = new ASRModule(http);
    this.animate = new AnimateModule(http);
    this.explain = new ExplainModule(http);
    this.usage = new UsageModule(http);
  }
}

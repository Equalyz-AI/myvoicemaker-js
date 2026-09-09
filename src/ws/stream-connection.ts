import type {
  StreamErrorEvent,
  StreamSessionBegin,
  StreamSessionEnd,
  StreamTranscriptEvent,
} from "../types/asr.js";
import {
  ConfigurationError,
  STREAM_ERROR_CODES,
  StreamClosedError,
  describeStreamClose,
} from "../errors/index.js";

export interface AsrStreamEvents {
  /** Server accepted the session (session.begin). */
  open: StreamSessionBegin;
  /** Interim or final transcript. */
  transcript: StreamTranscriptEvent;
  /** Ack for finalize(). */
  finalized: void;
  /** Protocol-level error reported by the server. */
  error: StreamErrorEvent;
  /** Final session summary (always sent before close). */
  end: StreamSessionEnd;
  /** Underlying socket closed. `description` explains the close code. */
  close: { code: number; reason: string; description: string };
}

type Listener<T> = (payload: T) => void;

export interface AsrStreamConnectionOptions {
  url: string;
  apiKey?: string | undefined;
  /**
   * Ephemeral stream token (`vmst_…`, minted server-side via
   * auth.createStreamToken). Takes precedence over apiKey — the recommended
   * credential for browsers, which should never hold the real key.
   */
  accessToken?: string | undefined;
  /**
   * Pass the credential via the `Sec-WebSocket-Protocol` header (works in
   * every runtime, keeps it out of URLs and access logs). When false it is
   * appended as ?api_key= instead. Default: true.
   */
  useSubprotocolAuth?: boolean | undefined;
  /** KeepAlive interval while the socket is open; 0 disables. Default 10s. */
  keepAliveMs?: number | undefined;
  /** SDK method that opened the connection, used in error messages. */
  method?: string | undefined;
}

const SUBPROTOCOL = "vmk.v1";
const KEY_SUBPROTOCOL_PREFIX = "vmk.key.";
const DEFAULT_KEEPALIVE_MS = 10_000;
const CLOSE_GRACE_MS = 3_000;

/**
 * Live transcription connection over the platform's global WebSocket
 * (browsers, Node >= 22, Bun, Deno — no dependencies).
 *
 * Send PCM16LE mono audio with sendAudio(); listen with on("transcript", ...).
 * Interim results (is_final: false) may be revised; finals never change.
 */
export class AsrStreamConnection {
  private readonly ws: WebSocket;
  private readonly listeners = new Map<keyof AsrStreamEvents, Set<Listener<never>>>();
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private sessionEnd: StreamSessionEnd | null = null;
  private closePromise: Promise<StreamSessionEnd | null>;
  private resolveClose!: (end: StreamSessionEnd | null) => void;
  private readonly method: string;
  private sessionBegan = false;
  private abortRequested = false;

  constructor(options: AsrStreamConnectionOptions) {
    const method = options.method ?? "asr.stream";
    if (typeof WebSocket === "undefined") {
      throw new ConfigurationError("websocket_unavailable", method);
    }

    const credential = options.accessToken ?? options.apiKey;
    if (!credential) {
      throw new ConfigurationError("credential_required", method);
    }
    this.method = method;

    const useSubprotocolAuth = options.useSubprotocolAuth ?? true;
    let url = options.url;
    let protocols: string[] | undefined;
    if (useSubprotocolAuth) {
      protocols = [SUBPROTOCOL, `${KEY_SUBPROTOCOL_PREFIX}${credential}`];
    } else {
      const withKey = new URL(url);
      withKey.searchParams.set("api_key", credential);
      url = withKey.toString();
    }

    this.closePromise = new Promise((resolve) => {
      this.resolveClose = resolve;
    });

    this.ws = new WebSocket(url, protocols);

    this.ws.addEventListener("open", () => {
      const keepAliveMs = options.keepAliveMs ?? DEFAULT_KEEPALIVE_MS;
      if (keepAliveMs > 0) {
        this.keepAliveTimer = setInterval(() => {
          if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "KeepAlive" }));
          }
        }, keepAliveMs);
      }
    });

    this.ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let payload: { type?: string } & Record<string, unknown>;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (payload.type) {
        case "session.begin":
          this.sessionBegan = true;
          this.emit("open", payload as unknown as StreamSessionBegin);
          return;
        case "transcript":
          this.emit("transcript", payload as unknown as StreamTranscriptEvent);
          return;
        case "finalized":
          this.emit("finalized", undefined);
          return;
        case "session.end":
          this.sessionEnd = payload as unknown as StreamSessionEnd;
          this.emit("end", this.sessionEnd);
          return;
        case "error":
          this.emit("error", payload as unknown as StreamErrorEvent);
          return;
        default:
          return;
      }
    });

    this.ws.addEventListener("close", (event) => {
      this.stopKeepAlive();
      // Closed before session.begin and not by us: the server refused the
      // upgrade with an HTTP error the WebSocket API hides. Surface that as a
      // typed error event so the developer is not left with a bare 1006.
      if (!this.sessionBegan && !this.abortRequested) {
        const info = STREAM_ERROR_CODES.upgrade_rejected;
        this.emit("error", {
          type: "error",
          code: "upgrade_rejected",
          message: `${this.method}(): ${info.title} — ${info.description} ${info.hint} [upgrade_rejected]`,
        });
      }
      this.resolveClose(this.sessionEnd);
      this.emit("close", {
        code: event.code,
        reason: event.reason ?? "",
        description: describeStreamClose(event.code),
      });
    });

    this.ws.addEventListener("error", () => {
      // A close event follows; connection-level failures without a server
      // error frame surface there (browsers expose no details here).
    });
  }

  on<K extends keyof AsrStreamEvents>(
    event: K,
    listener: Listener<AsrStreamEvents[K]>,
  ): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return this;
  }

  off<K extends keyof AsrStreamEvents>(
    event: K,
    listener: Listener<AsrStreamEvents[K]>,
  ): this {
    this.listeners.get(event)?.delete(listener as Listener<never>);
    return this;
  }

  private emit<K extends keyof AsrStreamEvents>(
    event: K,
    payload: AsrStreamEvents[K],
  ): void {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as Listener<AsrStreamEvents[K]>)(payload);
    }
  }

  /** True while audio can still be sent. */
  get isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  /** Session summary, available once the session has ended. */
  get result(): StreamSessionEnd | null {
    return this.sessionEnd;
  }

  /** Send a chunk of PCM16LE mono audio (50–250 ms per chunk works well). */
  sendAudio(chunk: ArrayBuffer | ArrayBufferView | Blob): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new StreamClosedError(`${this.method}().sendAudio`);
    }
    this.ws.send(chunk as never);
  }

  /** Flush pending words into a final transcript without closing the stream. */
  finalize(): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "Finalize" }));
    }
  }

  /**
   * Gracefully end the session: the server flushes remaining audio, sends the
   * last finals plus session.end, then closes. Resolves with the session
   * summary (or null if the socket dropped without one).
   */
  async close(): Promise<StreamSessionEnd | null> {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "CloseStream" }));
      const timeout = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), CLOSE_GRACE_MS + 5_000),
      );
      const result = await Promise.race([this.closePromise, timeout]);
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000);
      }
      return result ?? this.sessionEnd;
    }
    return this.closePromise;
  }

  /** Immediately drop the connection without waiting for the tail flush. */
  abort(): void {
    this.abortRequested = true;
    this.stopKeepAlive();
    try {
      this.ws.close(1000);
    } catch {
      // ignore
    }
  }

  /** Resolves when the socket has closed (with the session summary if any). */
  finished(): Promise<StreamSessionEnd | null> {
    return this.closePromise;
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
}

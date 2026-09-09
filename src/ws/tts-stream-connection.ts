import type {
  TtsAudioChunk,
  TtsChunkEnd,
  TtsChunkStart,
  TtsSessionBegin,
  TtsSessionEnd,
  TtsStreamErrorEvent,
} from "../types/tts-stream.js";
import {
  ConfigurationError,
  STREAM_ERROR_CODES,
  StreamClosedError,
  describeStreamClose,
} from "../errors/index.js";

export interface TtsStreamEvents {
  /** Server accepted the session (session.begin). */
  open: TtsSessionBegin;
  /** A text chunk is about to synthesize; binary audio frames follow. */
  chunkStart: TtsChunkStart;
  /** One binary PCM16LE frame (mono, session.begin's sample_rate). */
  audio: TtsAudioChunk;
  /** A chunk finished; all its audio frames have been delivered. */
  chunkEnd: TtsChunkEnd;
  /** Ack for finalize(): everything sent so far is synthesized and delivered. */
  finalized: void;
  /** Protocol-level error reported by the server. */
  error: TtsStreamErrorEvent;
  /** Final session summary (always sent before close). */
  end: TtsSessionEnd;
  /** Underlying socket closed. `description` explains the close code. */
  close: { code: number; reason: string; description: string };
}

type Listener<T> = (payload: T) => void;

export interface TtsStreamConnectionOptions {
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
// The server drains queued synthesis before session.end — each pending chunk
// needs a full GPU pass, so the grace here is much longer than the ASR one.
const CLOSE_GRACE_MS = 60_000;

/**
 * Streaming text-to-speech connection over the platform's global WebSocket
 * (browsers, Node >= 22, Bun, Deno — no dependencies).
 *
 * Send text with sendText() (whole paragraphs or incremental sentences);
 * receive audio with on("audio", ...) or the audioChunks() iterator. Audio is
 * raw PCM16LE mono at session.begin's sample_rate (24 kHz) — feed it to
 * createPcmPlayer() in browsers or pcmChunksToWav() for files.
 */
export class TtsStreamConnection {
  private readonly ws: WebSocket;
  private readonly listeners = new Map<keyof TtsStreamEvents, Set<Listener<never>>>();
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private sessionEnd: TtsSessionEnd | null = null;
  private closePromise: Promise<TtsSessionEnd | null>;
  private resolveClose!: (end: TtsSessionEnd | null) => void;
  private currentChunkIndex = 0;
  private readonly method: string;
  private sessionBegan = false;
  private abortRequested = false;

  // audioChunks() support: buffering starts on the first iterator request so
  // event-only consumers never accumulate audio in memory.
  private iteratorBuffer: Array<Uint8Array | null> | null = null;
  private iteratorWaiter: (() => void) | null = null;

  constructor(options: TtsStreamConnectionOptions) {
    const method = options.method ?? "tts.stream";
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
    // Standalone ArrayBuffer per frame in every runtime (never a Blob or a
    // pooled Buffer view) so handing the bytes onward is copy-safe.
    this.ws.binaryType = "arraybuffer";

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
      if (typeof event.data !== "string") {
        const data =
          event.data instanceof ArrayBuffer
            ? new Uint8Array(event.data)
            : ArrayBuffer.isView(event.data)
              ? new Uint8Array(
                  event.data.buffer,
                  event.data.byteOffset,
                  event.data.byteLength,
                )
              : null;
        if (data) {
          this.pushToIterator(data);
          this.emit("audio", { index: this.currentChunkIndex, data });
        }
        return;
      }
      let payload: { type?: string } & Record<string, unknown>;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (payload.type) {
        case "session.begin":
          this.sessionBegan = true;
          this.emit("open", payload as unknown as TtsSessionBegin);
          return;
        case "chunk.start":
          this.currentChunkIndex =
            typeof payload["index"] === "number"
              ? (payload["index"] as number)
              : this.currentChunkIndex;
          this.emit("chunkStart", payload as unknown as TtsChunkStart);
          return;
        case "chunk.end":
          this.emit("chunkEnd", payload as unknown as TtsChunkEnd);
          return;
        case "finalized":
          this.emit("finalized", undefined);
          return;
        case "session.end":
          this.sessionEnd = payload as unknown as TtsSessionEnd;
          this.emit("end", this.sessionEnd);
          return;
        case "error":
          this.emit("error", payload as unknown as TtsStreamErrorEvent);
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
      this.pushToIterator(null);
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

  on<K extends keyof TtsStreamEvents>(
    event: K,
    listener: Listener<TtsStreamEvents[K]>,
  ): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return this;
  }

  off<K extends keyof TtsStreamEvents>(
    event: K,
    listener: Listener<TtsStreamEvents[K]>,
  ): this {
    this.listeners.get(event)?.delete(listener as Listener<never>);
    return this;
  }

  private emit<K extends keyof TtsStreamEvents>(
    event: K,
    payload: TtsStreamEvents[K],
  ): void {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as Listener<TtsStreamEvents[K]>)(payload);
    }
  }

  /** True while text can still be sent. */
  get isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  /** Session summary, available once the session has ended. */
  get result(): TtsSessionEnd | null {
    return this.sessionEnd;
  }

  /**
   * Submit text to synthesize — a whole paragraph or incremental sentences
   * (type-ahead / LLM output). The server splits text into sentence-sized
   * chunks itself and holds back a trailing incomplete sentence until more
   * text, finalize() or close() arrives. A frame boundary is treated as a
   * word boundary. Max 2000 characters per call (chunkText() helps split).
   */
  sendText(text: string, opts?: { id?: string }): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new StreamClosedError(`${this.method}().sendText`);
    }
    const frame: Record<string, unknown> = { type: "Text", text };
    if (opts?.id !== undefined) frame["id"] = opts.id;
    this.ws.send(JSON.stringify(frame));
  }

  /** Flush the held-back sentence tail and synthesize everything submitted so
   * far, without closing the stream. Acked with a "finalized" event once all
   * of it has been delivered. */
  finalize(): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "Finalize" }));
    }
  }

  /**
   * Gracefully end the session: the server synthesizes and delivers all
   * remaining text, sends session.end, then closes. Resolves with the session
   * summary (or null if the socket dropped without one).
   */
  async close(): Promise<TtsSessionEnd | null> {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "CloseStream" }));
      const timeout = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), CLOSE_GRACE_MS),
      );
      const result = await Promise.race([this.closePromise, timeout]);
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000);
      }
      return result ?? this.sessionEnd;
    }
    return this.closePromise;
  }

  /** Immediately drop the connection without waiting for pending synthesis. */
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
  finished(): Promise<TtsSessionEnd | null> {
    return this.closePromise;
  }

  /**
   * Async-iterate the raw PCM frames (ends when the session closes). Call it
   * BEFORE sending text — frames received earlier are only delivered to
   * "audio" listeners, not buffered retroactively.
   *
   *   for await (const pcm of stream.audioChunks()) { chunks.push(pcm); }
   */
  audioChunks(): AsyncIterableIterator<Uint8Array> {
    if (!this.iteratorBuffer) {
      this.iteratorBuffer = [];
      if (this.ws.readyState === WebSocket.CLOSED) {
        this.iteratorBuffer.push(null);
      }
    }
    const buffer = this.iteratorBuffer;
    const self = this;

    const iterator: AsyncIterableIterator<Uint8Array> = {
      [Symbol.asyncIterator]() {
        return iterator;
      },
      async next(): Promise<IteratorResult<Uint8Array>> {
        for (;;) {
          const item = buffer.shift();
          if (item !== undefined) {
            if (item === null) {
              buffer.push(null); // keep the stream terminal for re-entry
              return { done: true, value: undefined };
            }
            return { done: false, value: item };
          }
          await new Promise<void>((resolve) => {
            self.iteratorWaiter = resolve;
          });
        }
      },
      async return(): Promise<IteratorResult<Uint8Array>> {
        return { done: true, value: undefined };
      },
    };
    return iterator;
  }

  private pushToIterator(item: Uint8Array | null): void {
    if (!this.iteratorBuffer) return;
    this.iteratorBuffer.push(item);
    this.iteratorWaiter?.();
    this.iteratorWaiter = null;
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
}

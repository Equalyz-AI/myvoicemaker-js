export interface PcmPlayerOptions {
  /** Sample rate of the incoming PCM. Default 24000 (streaming TTS output). */
  sampleRate?: number;
  /** Reuse an existing AudioContext instead of creating (and owning) one. */
  audioContext?: AudioContext;
}

export interface PcmPlayer {
  /** Schedule a PCM16LE mono frame for gapless playback. */
  enqueue(chunk: Uint8Array | ArrayBuffer): void;
  /** Stop playback and release the AudioContext (if the player created it). */
  stop(): Promise<void>;
  /** Called when playback caught up with scheduling (an audible gap). */
  onUnderrun?: (() => void) | undefined;
  /** Seconds of audio scheduled but not yet played. */
  readonly bufferedSeconds: number;
  /** Total seconds of audio scheduled so far. */
  readonly scheduledSeconds: number;
  readonly context: AudioContext;
}

// Scheduling headroom for the very first chunk; afterwards chunks abut the
// cursor exactly, so playback is gapless as long as generation keeps up.
const START_DELAY_S = 0.05;

/**
 * Minimal gapless player for streamed PCM16 frames (browser-only — requires
 * Web Audio). Importing this module is safe everywhere; only calling
 * createPcmPlayer() requires an AudioContext.
 *
 *   const player = createPcmPlayer();
 *   stream.on("audio", ({ data }) => player.enqueue(data));
 */
export const createPcmPlayer = (options?: PcmPlayerOptions): PcmPlayer => {
  const AudioContextCtor =
    typeof AudioContext !== "undefined"
      ? AudioContext
      : (globalThis as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error(
      "createPcmPlayer requires the Web Audio API (browser). In Node, collect chunks and use pcmChunksToWav() instead.",
    );
  }

  const sampleRate = options?.sampleRate ?? 24_000;
  const ownsContext = !options?.audioContext;
  const context = options?.audioContext ?? new AudioContextCtor();
  const sources = new Set<AudioBufferSourceNode>();
  let scheduledUntil = 0;
  let totalScheduled = 0;
  let startedPlayback = false;
  let stopped = false;

  const player: PcmPlayer = {
    context,
    onUnderrun: undefined,

    get bufferedSeconds(): number {
      return Math.max(0, scheduledUntil - context.currentTime);
    },

    get scheduledSeconds(): number {
      return totalScheduled;
    },

    enqueue(chunk: Uint8Array | ArrayBuffer): void {
      if (stopped) return;
      const bytes =
        chunk instanceof Uint8Array
          ? chunk
          : new Uint8Array(chunk);
      const sampleCount = Math.floor(bytes.byteLength / 2);
      if (sampleCount === 0) return;

      // Browsers suspend fresh AudioContexts until a user gesture; resuming
      // on data is best-effort and idempotent.
      if (context.state === "suspended") {
        void context.resume().catch(() => undefined);
      }

      const floats = new Float32Array(sampleCount);
      const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
      for (let i = 0; i < sampleCount; i += 1) {
        floats[i] = view.getInt16(i * 2, true) / 32768;
      }

      const buffer = context.createBuffer(1, sampleCount, sampleRate);
      buffer.copyToChannel(floats, 0);

      const now = context.currentTime;
      if (startedPlayback && scheduledUntil <= now) {
        player.onUnderrun?.();
      }
      const startAt = Math.max(now + START_DELAY_S, scheduledUntil);

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        sources.delete(source);
      };
      source.start(startAt);
      sources.add(source);

      scheduledUntil = startAt + buffer.duration;
      totalScheduled += buffer.duration;
      startedPlayback = true;
    },

    async stop(): Promise<void> {
      stopped = true;
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // already stopped
        }
      }
      sources.clear();
      scheduledUntil = 0;
      if (ownsContext && context.state !== "closed") {
        await context.close().catch(() => undefined);
      }
    },
  };

  return player;
};

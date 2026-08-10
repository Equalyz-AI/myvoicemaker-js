/**
 * Stream a WAV file to the real-time transcription API at real-time pace.
 *
 * Usage:
 *   VOICEMAKER_API_KEY=vmk_live_... bun examples/stream-file.ts ./audio.wav en
 *   (or: npx tsx examples/stream-file.ts ./audio.wav en — requires Node >= 22)
 *
 * The WAV must be PCM16LE mono. Its sample rate is read from the header and
 * passed to the API, which resamples to 16 kHz server-side.
 */
import { readFile } from "node:fs/promises";
import { VoiceMaker, type StreamLanguage } from "myvoicemaker";

const [, , wavPath, language = "en"] = process.argv;
if (!wavPath) {
  console.error("usage: stream-file.ts <path-to-wav> [language]");
  process.exit(1);
}

const apiKey = process.env.VOICEMAKER_API_KEY;
if (!apiKey) {
  console.error("Set VOICEMAKER_API_KEY");
  process.exit(1);
}

// Minimal WAV parsing: find the fmt/data chunks of a PCM16 file.
const parseWav = (bytes: Buffer) => {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Not a RIFF/WAVE file");
  }
  let offset = 12;
  let sampleRate = 16000;
  let channels = 1;
  let bitsPerSample = 16;
  let data: Buffer | null = null;
  while (offset + 8 <= bytes.length) {
    const chunkId = bytes.toString("ascii", offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    if (chunkId === "fmt ") {
      channels = bytes.readUInt16LE(offset + 10);
      sampleRate = bytes.readUInt32LE(offset + 12);
      bitsPerSample = bytes.readUInt16LE(offset + 22);
    } else if (chunkId === "data") {
      data = bytes.subarray(offset + 8, offset + 8 + chunkSize);
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (!data) throw new Error("No data chunk found");
  if (bitsPerSample !== 16 || channels !== 1) {
    throw new Error(`Need PCM16 mono (got ${bitsPerSample}-bit, ${channels}ch)`);
  }
  return { sampleRate, pcm: data };
};

const { sampleRate, pcm } = parseWav(await readFile(wavPath));
const durationS = pcm.length / (2 * sampleRate);
console.log(`Streaming ${durationS.toFixed(1)}s of ${sampleRate}Hz audio (${language})...`);

const client = new VoiceMaker({ apiKey, baseUrl: process.env.VOICEMAKER_BASE_URL });
const stream = client.asr.stream({
  language: language as StreamLanguage,
  sampleRate,
});

stream.on("open", (session) => {
  console.log(`session ${session.session_id} — ${session.credits_per_second} credits/s`);
});
stream.on("transcript", (event) => {
  const marker = event.is_final ? "FINAL  " : "interim";
  console.log(`${marker} ${event.text}`);
});
stream.on("error", (error) => {
  console.error(`error [${error.code}]: ${error.message}`);
});
stream.on("end", (end) => {
  console.log(
    `session ended (${end.reason}) — ${end.duration_seconds}s, ${end.credits_used} credits`,
  );
});

// Wait for the socket to open, then pace 100ms chunks like a live microphone.
await new Promise<void>((resolve, reject) => {
  stream.on("open", () => resolve());
  stream.on("close", ({ code, reason }) =>
    reject(new Error(`closed before open: ${code} ${reason}`)),
  );
});

const chunkBytes = Math.floor(sampleRate * 0.1) * 2;
for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
  if (!stream.isOpen) break;
  stream.sendAudio(pcm.subarray(offset, offset + chunkBytes));
  await new Promise((resolve) => setTimeout(resolve, 100));
}

const summary = await stream.close();
console.log("done:", summary);

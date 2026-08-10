/**
 * Stream TTS to a WAV file from Node/Bun.
 *
 *   VOICEMAKER_API_KEY=vmk_... bun run examples/tts-stream-node.ts [voice_id]
 *
 * Audio chunks arrive while later sentences are still synthesizing; the first
 * chunk typically lands within a few seconds on a warm engine.
 */
import { writeFile } from "node:fs/promises";
import { VoiceMaker, chunkText, pcmChunksToWav } from "../src/index.js";

const apiKey = process.env.VOICEMAKER_API_KEY;
if (!apiKey) {
  console.error("Set VOICEMAKER_API_KEY");
  process.exit(1);
}

const voiceId = process.argv[2] ?? "amaka";
const text =
  "Barka da zuwa. Wannan gwaji ne na karatun rubutu kai tsaye. " +
  "Kowace jimla tana iso da zarar an gama hada ta, ba sai an jira komai ba.";

const client = new VoiceMaker({ apiKey });
const stream = client.tts.stream({ voiceId, language: "auto" });

stream.on("open", (begin) => {
  console.log(
    `session ${begin.session_id}: ${begin.sample_rate} Hz, ${begin.credits_per_character} credit(s)/char`,
  );
});
stream.on("chunkStart", (chunk) => {
  console.log(`chunk ${chunk.index} started: "${chunk.text}"`);
});
stream.on("chunkEnd", (chunk) => {
  console.log(
    `chunk ${chunk.index} done: ${chunk.duration_seconds}s, ${chunk.credits} credit(s)`,
  );
});
stream.on("error", (error) => {
  console.error(`stream error [${error.code}]: ${error.message}`);
});

// Start the iterator BEFORE sending text so no frames are missed.
const collect = (async () => {
  const frames: Uint8Array[] = [];
  for await (const pcm of stream.audioChunks()) {
    frames.push(pcm);
  }
  return frames;
})();

// Sending sentence-by-sentence is optional (the server chunks full paragraphs
// itself); it demonstrates incremental/type-ahead submission.
for (const sentence of chunkText(text)) {
  stream.sendText(sentence);
}

const end = await stream.close();
const frames = await collect;
await writeFile("tts-stream-output.wav", pcmChunksToWav(frames));

console.log(
  end
    ? `done: ${end.chunks} chunk(s), ${end.duration_seconds}s audio, ${end.credits_used} credit(s) -> tts-stream-output.wav`
    : "session ended without a summary",
);

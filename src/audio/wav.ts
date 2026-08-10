export interface PcmChunksToWavOptions {
  /** Sample rate of the PCM data. Default 24000 (streaming TTS output). */
  sampleRate?: number;
}

/**
 * Wrap raw PCM16LE mono chunks (e.g. collected from a TTS stream) in a WAV
 * container. Pure byte assembly — works in every runtime, no dependencies.
 *
 *   const chunks: Uint8Array[] = [];
 *   for await (const pcm of stream.audioChunks()) chunks.push(pcm);
 *   await fs.writeFile("out.wav", pcmChunksToWav(chunks));
 */
export const pcmChunksToWav = (
  chunks: ReadonlyArray<Uint8Array>,
  options?: PcmChunksToWavOptions,
): Uint8Array => {
  const sampleRate = options?.sampleRate ?? 24_000;
  const channels = 1;
  const bytesPerSample = 2;

  let dataLength = 0;
  for (const chunk of chunks) {
    dataLength += chunk.byteLength;
  }

  const output = new Uint8Array(44 + dataLength);
  const view = new DataView(output.buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      output[offset + i] = text.charCodeAt(i);
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format: PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true); // byte rate
  view.setUint16(32, channels * bytesPerSample, true); // block align
  view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

export interface ChunkTextOptions {
  /** Max characters per chunk. Default 280 (matches the server's chunking). */
  maxChars?: number;
  /** Smaller cap for the first chunk => faster first audio. Default 160. */
  firstChunkMaxChars?: number;
  /** BCP-47 locale hint for sentence segmentation (e.g. "ha", "en"). */
  locale?: string;
}

const DEFAULT_MAX_CHARS = 280;
const DEFAULT_FIRST_CHUNK_MAX_CHARS = 160;

// Fallback-splitter guard: sentence terminators directly after these are
// usually abbreviations, not sentence ends. (Intl.Segmenter handles this
// itself when available.)
const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "no",
  "vs",
  "etc",
  "e.g",
  "i.e",
]);

const normalize = (text: string): string =>
  text.replace(/\s+/g, " ").trim();

type SentenceSegmenter = { segment(text: string): Iterable<{ segment: string }> };

const getSegmenter = (locale?: string): SentenceSegmenter | null => {
  const IntlAny = Intl as unknown as {
    Segmenter?: new (
      locale?: string,
      options?: { granularity: string },
    ) => SentenceSegmenter;
  };
  if (typeof IntlAny.Segmenter !== "function") return null;
  try {
    return new IntlAny.Segmenter(locale, { granularity: "sentence" });
  } catch {
    return null;
  }
};

const splitSentencesFallback = (text: string): string[] => {
  // Sentence = anything up to a terminator run (+ closing quotes) followed by
  // whitespace or end of text. No lookbehind, so it parses everywhere.
  const matches = text.match(/[^.!?…]*[.!?…]+["'"')\]]*(?:\s+|$)|[^.!?…]+$/g) ?? [
    text,
  ];
  return matches.map((raw) => raw.trim()).filter(Boolean);
};

// Re-join false splits after known abbreviations ("Mr." / "No." / "e.g.") —
// both the regex fallback AND Intl.Segmenter produce them.
const mergeAbbreviationSplits = (sentences: string[]): string[] => {
  const merged: string[] = [];
  for (const piece of sentences) {
    const previous = merged[merged.length - 1];
    if (previous) {
      const lastWord = previous
        .replace(/[.!?…"'"')\]]+$/, "")
        .split(" ")
        .pop()
        ?.toLowerCase();
      if (lastWord && ABBREVIATIONS.has(lastWord)) {
        merged[merged.length - 1] = `${previous} ${piece}`;
        continue;
      }
    }
    merged.push(piece);
  }
  return merged;
};

const splitSentences = (text: string, locale?: string): string[] => {
  const segmenter = getSegmenter(locale);
  let sentences: string[] = [];
  if (segmenter) {
    for (const { segment } of segmenter.segment(text)) {
      const piece = segment.trim();
      if (piece) sentences.push(piece);
    }
  }
  if (sentences.length === 0) {
    sentences = splitSentencesFallback(text);
  }
  return mergeAbbreviationSplits(sentences);
};

const hardSplit = (sentence: string, maxChars: number): string[] => {
  const words = sentence.split(" ").filter(Boolean);
  const pieces: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
      continue;
    }
    pieces.push(current);
    current = word;
  }
  if (current) pieces.push(current);
  return pieces;
};

/**
 * Split text into sentence-aligned chunks sized for streaming TTS: tiny
 * sentences merge up to the cap, over-long sentences split at word boundaries
 * (never mid-word), and the first chunk uses a smaller cap so the session's
 * first audio arrives sooner.
 *
 * This is a client convenience for driving sendText() sentence-by-sentence —
 * the server re-chunks authoritatively, so exact parity is not required.
 * Uses Intl.Segmenter (all modern browsers, Node >= 16) with a regex fallback.
 */
export const chunkText = (
  text: string,
  options?: ChunkTextOptions,
): string[] => {
  const maxChars = Math.max(1, Math.floor(options?.maxChars ?? DEFAULT_MAX_CHARS));
  const firstChunkMaxChars = Math.max(
    1,
    Math.min(
      Math.floor(options?.firstChunkMaxChars ?? DEFAULT_FIRST_CHUNK_MAX_CHARS),
      maxChars,
    ),
  );
  const normalized = normalize(text);
  if (!normalized) return [];

  const chunks: string[] = [];
  let current = "";
  const capFor = () => (chunks.length === 0 ? firstChunkMaxChars : maxChars);

  for (const sentence of splitSentences(normalized, options?.locale)) {
    let cap = capFor();
    if (sentence.length > cap && !current) {
      const pieces = hardSplit(sentence, cap);
      // All complete pieces become chunks; the last may still merge with the
      // next sentence if it is short.
      for (const piece of pieces.slice(0, -1)) {
        chunks.push(piece);
      }
      current = pieces[pieces.length - 1] ?? "";
      continue;
    }
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= cap) {
      current = candidate;
      continue;
    }
    if (current) {
      chunks.push(current);
      current = "";
    }
    cap = capFor();
    if (sentence.length <= cap) {
      current = sentence;
    } else {
      const pieces = hardSplit(sentence, cap);
      for (const piece of pieces.slice(0, -1)) {
        chunks.push(piece);
      }
      current = pieces[pieces.length - 1] ?? "";
    }
  }

  if (current) chunks.push(current);
  return chunks;
};

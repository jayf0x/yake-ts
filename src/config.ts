import { ENGLISH_STOPWORDS } from "./stopwords-en.js";

export interface YakeTsOptions {
  /** Max words per candidate keyword phrase. Default 3. */
  maxNgramSize?: number;
  /** Co-occurrence window size for the relatedness feature. Default 1. */
  windowSize?: number;
  /** Similarity ceiling above which a candidate is dropped as a near-duplicate. 1 disables dedup. Default 0.9. */
  dedupeThreshold?: number;
  /** Max number of keywords to return. Default 10. */
  limit?: number;
  /** Stopwords to use; defaults to bundled English. Pass your own set for other languages. */
  stopwords?: Iterable<string>;
}

export interface ResolvedOptions {
  maxNgramSize: number;
  windowSize: number;
  dedupeThreshold: number;
  limit: number;
  stopwords: Set<string>;
}

const DEFAULT_MAX_NGRAM_SIZE = 3;
const DEFAULT_WINDOW_SIZE = 1;
const DEFAULT_DEDUPE_THRESHOLD = 0.9;
const DEFAULT_LIMIT = 10;

export function resolveOptions(options: YakeTsOptions = {}): ResolvedOptions {
  const maxNgramSize = options.maxNgramSize ?? DEFAULT_MAX_NGRAM_SIZE;
  const windowSize = options.windowSize ?? DEFAULT_WINDOW_SIZE;
  const dedupeThreshold = options.dedupeThreshold ?? DEFAULT_DEDUPE_THRESHOLD;
  const limit = options.limit ?? DEFAULT_LIMIT;

  for (const [name, value] of [
    ["maxNgramSize", maxNgramSize],
    ["windowSize", windowSize],
    ["limit", limit],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) {
      throw new TypeError(`${name} must be a positive integer, got ${value}.`);
    }
  }

  if (!Number.isFinite(dedupeThreshold) || dedupeThreshold < 0) {
    throw new TypeError(`dedupeThreshold must be a finite non-negative number, got ${dedupeThreshold}.`);
  }

  const stopwords = options.stopwords == null
    ? new Set(ENGLISH_STOPWORDS)
    : new Set([...options.stopwords].map((word) => word.toLowerCase()));

  return { maxNgramSize, windowSize, dedupeThreshold, limit, stopwords };
}

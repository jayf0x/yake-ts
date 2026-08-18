import { STOPWORDS as ENGLISH_STOPWORDS } from "./stopwords/en.js";

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

const DEFAULTS = {
  maxNgramSize: 3,
  windowSize: 1,
  dedupeThreshold: 0.9,
  limit: 10,
} as const satisfies Record<string, number>;

const withDefault = <K extends keyof typeof DEFAULTS>(key: K, value: number | undefined) =>
  typeof value === typeof DEFAULTS[key] ? (value as number) : DEFAULTS[key];

export const resolveOptions = ({
  maxNgramSize,
  windowSize,
  dedupeThreshold,
  limit,
  stopwords,
}: YakeTsOptions = {}): ResolvedOptions => ({
  maxNgramSize: withDefault("maxNgramSize", maxNgramSize),
  windowSize: withDefault("windowSize", windowSize),
  dedupeThreshold: withDefault("dedupeThreshold", dedupeThreshold),
  limit: withDefault("limit", limit),
  stopwords:
    stopwords == null ? new Set(ENGLISH_STOPWORDS) : new Set(Array.from(stopwords, (word) => word.toLowerCase())),
});

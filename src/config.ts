// Only the English default is imported here, deliberately — statically importing every
// src/stopwords/*.ts file would bundle all 33 languages into every consumer, English-only
// users included. Other languages are separate subpath exports (yake-ts/stopwords/<code>);
// see the `stopwords` option doc below.
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
  /**
   * Stopwords to use. Defaults to bundled English. For other languages, import
   * `STOPWORDS` from `yake-ts/stopwords/<code>` (e.g. `yake-ts/stopwords/fr`) and pass it here —
   * each language is its own subpath export so you only pay for the ones you use. Or pass a
   * fully custom set.
   */
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
} satisfies Required<Omit<YakeTsOptions, "stopwords">>;

export const resolveOptions = ({
  maxNgramSize = DEFAULTS.maxNgramSize,
  windowSize = DEFAULTS.windowSize,
  dedupeThreshold = DEFAULTS.dedupeThreshold,
  limit = DEFAULTS.limit,
  stopwords,
}: YakeTsOptions = {}): ResolvedOptions => ({
  maxNgramSize,
  windowSize,
  dedupeThreshold,
  limit,
  stopwords:
    stopwords == null ? new Set(ENGLISH_STOPWORDS) : new Set(Array.from(stopwords, (word) => word.toLowerCase())),
});

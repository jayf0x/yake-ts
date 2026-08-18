import { buildDocument, scoreAllCandidates, scoreSingleTerms } from "./internal/data-core.js";
import { isValidCandidate, type Candidate } from "./internal/composed-word.js";
import { levenshteinSimilarity } from "./similarity.js";
import { resolveOptions, type YakeTsOptions } from "./config.js";

export interface Keyword {
  /** Surface form as it appeared in the source text. */
  keyword: string;
  /** Lowercased form used for matching/deduplication. */
  normalized: string;
  /** YAKE score — lower is more relevant. */
  score: number;
  ngramSize: number;
  occurrences: number;
}

export function extractKeywords(text: string, options: YakeTsOptions = {}): Keyword[] {
  if (!text) {
    return [];
  }

  const resolved = resolveOptions(options);
  const document = buildDocument(text, resolved.stopwords, {
    windowSize: resolved.windowSize,
    maxNgramSize: resolved.maxNgramSize,
  });

  scoreSingleTerms(document);
  scoreAllCandidates(document);

  const candidates = [...document.candidates.values()]
    .filter((candidate) => isValidCandidate(candidate))
    .sort(compareCandidates);

  if (resolved.dedupeThreshold >= 1) {
    return candidates.slice(0, resolved.limit).map(toKeyword);
  }

  const kept: Candidate[] = [];
  for (const candidate of candidates) {
    const isDuplicate = kept.some(
      (existing) => levenshteinSimilarity(candidate.uniqueKw, existing.uniqueKw) > resolved.dedupeThreshold,
    );
    if (!isDuplicate) {
      kept.push(candidate);
    }
    if (kept.length === resolved.limit) {
      break;
    }
  }

  return kept.map(toKeyword);
}

function compareCandidates(a: Candidate, b: Candidate): number {
  const delta = a.h - b.h;
  if (Math.abs(delta) > 1e-15) {
    return delta;
  }
  return a.order - b.order;
}

function toKeyword(candidate: Candidate): Keyword {
  return {
    keyword: candidate.kw,
    normalized: candidate.uniqueKw,
    score: candidate.h,
    ngramSize: candidate.size,
    occurrences: candidate.tf,
  };
}

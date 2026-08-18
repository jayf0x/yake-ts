import type { CooccurrenceGraph } from "./graph.js";
import * as graph from "./graph.js";
import type { TermState } from "./single-word.js";
import { STOPWORD_WEIGHT } from "./tokenize.js";

export type NormalizedCandidateTerm = [tag: string, word: string, term: TermState | null, normalizedWord?: string];

export interface Candidate {
  readonly tags: Set<string>;
  readonly kw: string;
  readonly uniqueKw: string;
  readonly size: number;
  readonly terms: TermState[];
  readonly startOrEndStopwords: boolean;
  order: number;
  tf: number;
  h: number;
}

/**
 * A candidate keyword phrase (one or more words) and its aggregate YAKE
 * score. Plain record + functions, for the same reason as TermState: one
 * candidate object per phrase per extraction, scored once, never reused.
 */
export const createCandidate = (terms: NormalizedCandidateTerm[]): Candidate => {
  if (terms.length === 0 || !terms.some(([, , term]) => term != null)) {
    throw new TypeError("createCandidate requires at least one term that exists in the document term index");
  }

  const nonNullTerms = terms.map(([, , term]) => term).filter((term): term is TermState => term != null);

  return {
    tags: new Set([terms.map(([tag]) => tag).join("")]),
    kw: terms.map(([, word]) => word).join(" "),
    uniqueKw: terms.map(([, word, , normalizedWord]) => normalizedWord ?? word.toLowerCase()).join(" "),
    size: terms.length,
    terms: nonNullTerms,
    startOrEndStopwords: nonNullTerms[0]!.stopword || nonNullTerms[nonNullTerms.length - 1]!.stopword,
    order: 0,
    tf: 0,
    h: 1,
  };
};

/**
 * Merges tag information from another occurrence of the same candidate.
 */
export const mergeCandidateTags = (candidate: Candidate, other: Candidate): void => {
  for (const tag of other.tags) candidate.tags.add(tag);
};

/**
 * A valid keyword phrase has no digit/unusual tokens and doesn't start or end with a stopword.
 */
export const isValidCandidate = (candidate: Candidate): boolean =>
  [...candidate.tags].some((tag) => !tag.includes("u") && !tag.includes("d")) && !candidate.startOrEndStopwords;

/**
 * Computes the final YAKE multi-word score (lower is better).
 */
export const scoreCandidate = (candidate: Candidate, coGraph: CooccurrenceGraph): void => {
  let sumH = 0;
  let prodH = 1;

  for (let index = 0; index < candidate.terms.length; index += 1) {
    const termBase = candidate.terms[index]!;

    if (!termBase.stopword) {
      sumH += termBase.h;
      prodH *= termBase.h;
      continue;
    }

    if (STOPWORD_WEIGHT === "bi") {
      let probT1 = 0;
      if (index > 0 && graph.hasEdge(coGraph, candidate.terms[index - 1]!.id, termBase.id)) {
        probT1 = graph.getWeight(coGraph, candidate.terms[index - 1]!.id, termBase.id) / candidate.terms[index - 1]!.tf;
      }

      let probT2 = 0;
      if (index < candidate.terms.length - 1 && graph.hasEdge(coGraph, termBase.id, candidate.terms[index + 1]!.id)) {
        probT2 = graph.getWeight(coGraph, termBase.id, candidate.terms[index + 1]!.id) / candidate.terms[index + 1]!.tf;
      }

      const prob = probT1 * probT2;
      prodH *= 1 + (1 - prob);
      sumH -= 1 - prob;
    }
  }

  candidate.h = prodH / ((sumH + 1) * candidate.tf);
};

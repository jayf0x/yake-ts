import * as graph from "./graph.js";
import type { CooccurrenceGraph } from "./graph.js";

export interface TermState {
  readonly id: number;
  readonly uniqueTerm: string;
  readonly occurs: Map<number, Array<[posSent: number, posText: number]>>;
  stopword: boolean;
  h: number;
  tf: number;
  tfA: number;
  tfN: number;
  wfreq: number;
  wcase: number;
  wrel: number;
  wpos: number;
  wspread: number;
  pl: number;
  pr: number;
}

interface WordStats {
  maxTf: number;
  avgTf: number;
  stdTf: number;
  numberOfSentences: number;
}

/**
 * Per-term statistics and the single-word YAKE score (H — lower is better).
 * Plain mutable record + functions: each term is created once and scored
 * once per extraction, so there's no reuse or polymorphism a class would buy.
 */
export function createTerm(uniqueTerm: string, id: number): TermState {
  return {
    id,
    uniqueTerm,
    occurs: new Map(),
    stopword: false,
    h: 0,
    tf: 0,
    tfA: 0,
    tfN: 0,
    wfreq: 0,
    wcase: 0,
    wrel: 1,
    wpos: 1,
    wspread: 0,
    pl: 0,
    pr: 0,
  };
}

/**
 * Records an occurrence of this term.
 */
export function addOccurrence(term: TermState, tag: string, sentenceId: number, posSent: number, posText: number): void {
  let occurrences = term.occurs.get(sentenceId);
  if (occurrences == null) {
    occurrences = [];
    term.occurs.set(sentenceId, occurrences);
  }

  occurrences.push([posSent, posText]);
  term.tf += 1;

  if (tag === "a") {
    term.tfA += 1;
  }

  if (tag === "n") {
    term.tfN += 1;
  }
}

/**
 * Computes the final YAKE single-word score. Graph metrics are recomputed
 * here rather than cached on the term — each term is scored exactly once
 * per extraction, so a cache would only add invalidation bookkeeping for
 * zero repeat-call benefit.
 */
export function scoreTerm(term: TermState, coGraph: CooccurrenceGraph, stats: WordStats): void {
  const wdr = graph.outDegree(coGraph, term.id);
  const wir = graph.outWeightSum(coGraph, term.id);
  const pwr = wir === 0 ? 0 : wdr / wir;

  const wdl = graph.inDegree(coGraph, term.id);
  const wil = graph.inWeightSum(coGraph, term.id);
  const pwl = wil === 0 ? 0 : wdl / wil;

  term.pl = wdl / stats.maxTf;
  term.pr = wdr / stats.maxTf;
  term.wrel = (0.5 + (pwl * (term.tf / stats.maxTf))) + (0.5 + (pwr * (term.tf / stats.maxTf)));

  term.wfreq = term.tf / (stats.avgTf + stats.stdTf);
  term.wspread = term.occurs.size / stats.numberOfSentences;
  term.wcase = Math.max(term.tfA, term.tfN) / (1 + Math.log(term.tf));

  const sentenceIds = [...term.occurs.keys()].sort((a, b) => a - b);
  term.wpos = Math.log(Math.log(3 + median(sentenceIds)));

  term.h = (term.wpos * term.wrel) / (term.wcase + (term.wfreq / term.wrel) + (term.wspread / term.wrel));
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const mid = Math.floor(values.length / 2);
  if (values.length % 2 === 1) {
    return values[mid]!;
  }

  return (values[mid - 1]! + values[mid]!) / 2;
}

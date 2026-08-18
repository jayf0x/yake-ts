import { createCandidate, isValidCandidate, mergeCandidateTags, scoreCandidate, type Candidate, type NormalizedCandidateTerm } from "./composed-word.js";
import { addNode, createGraph, incrementEdge, type CooccurrenceGraph } from "./graph.js";
import { addOccurrence, createTerm, scoreTerm, type TermState } from "./single-word.js";
import { DEFAULT_EXCLUDE, getTag, preFilter, splitSentences, tokenizeWords } from "./tokenize.js";

type BlockWord = [tag: string, word: string, term: TermState, normalizedWord: string];

export interface Document {
  readonly graph: CooccurrenceGraph;
  readonly terms: Map<string, TermState>;
  readonly candidates: Map<string, Candidate>;
  readonly numberOfSentences: number;
}

export interface DocumentConfig {
  windowSize: number;
  maxNgramSize: number;
}

/**
 * Builds the document state (terms, co-occurrence graph, candidates) the
 * YAKE scoring pipeline runs over. One function call per extraction — the
 * "private methods" of the original class-based version are now local
 * closures over a builder object, since none of them are ever called
 * outside this one build.
 */
export function buildDocument(text: string, stopwordSet: Set<string>, config: DocumentConfig): Document {
  const graph = createGraph();
  const terms = new Map<string, TermState>();
  const candidates = new Map<string, Candidate>();
  const exclude = DEFAULT_EXCLUDE;
  const tagsToDiscard = new Set(["u", "d"]);
  let candidateOrder = 0;

  function getTerm(normalizedWord: string): TermState {
    let uniqueTerm = normalizedWord;
    const simpleStopword = stopwordSet.has(uniqueTerm);

    if (uniqueTerm.endsWith("s") && uniqueTerm.length > 3) {
      uniqueTerm = uniqueTerm.slice(0, -1);
    }

    const existing = terms.get(uniqueTerm);
    if (existing != null) {
      return existing;
    }

    let simpleUniqueTerm = uniqueTerm;
    for (const punctuation of exclude) {
      simpleUniqueTerm = simpleUniqueTerm.replaceAll(punctuation, "");
    }

    const term = createTerm(uniqueTerm, terms.size);
    term.stopword = simpleStopword || stopwordSet.has(uniqueTerm) || simpleUniqueTerm.length < 3;

    addNode(graph, term.id);
    terms.set(uniqueTerm, term);

    return term;
  }

  function addOrUpdateCandidate(candidate: Candidate): void {
    const existing = candidates.get(candidate.uniqueKw);

    if (existing == null) {
      candidate.order = candidateOrder;
      candidateOrder += 1;
      candidates.set(candidate.uniqueKw, candidate);
    } else {
      mergeCandidateTags(existing, candidate);
    }

    candidates.get(candidate.uniqueKw)!.tf += 1;
  }

  function generateCandidates(tag: string, word: string, normalizedWord: string, termObj: TermState, blockOfWordObj: BlockWord[], maxNgramSize: number): void {
    const candidateTerms: NormalizedCandidateTerm[] = [[tag, word, termObj, normalizedWord]];
    addOrUpdateCandidate(createCandidate(candidateTerms));

    const start = Math.max(0, blockOfWordObj.length - (maxNgramSize - 1));
    for (let index = blockOfWordObj.length - 1; index >= start; index -= 1) {
      candidateTerms.push(blockOfWordObj[index]!);
      addOrUpdateCandidate(createCandidate([...candidateTerms].reverse()));
    }
  }

  function updateCooccurrence(blockOfWordObj: BlockWord[], termObj: TermState, windowSize: number): void {
    const start = Math.max(0, blockOfWordObj.length - windowSize);

    for (let index = start; index < blockOfWordObj.length; index += 1) {
      const blockWord = blockOfWordObj[index]!;
      if (!tagsToDiscard.has(blockWord[0])) {
        incrementEdge(graph, blockWord[2].id, termObj.id);
      }
    }
  }

  function processWord(word: string, posText: number, sentenceId: number, posSent: number, blockOfWordObj: BlockWord[], windowSize: number, maxNgramSize: number): number {
    const normalizedWord = word.toLowerCase();
    const tag = getTag(word, posSent, exclude);
    const termObj = getTerm(normalizedWord);

    addOccurrence(termObj, tag, sentenceId, posSent, posText);

    if (!tagsToDiscard.has(tag)) {
      updateCooccurrence(blockOfWordObj, termObj, windowSize);
    }

    generateCandidates(tag, word, normalizedWord, termObj, blockOfWordObj, maxNgramSize);
    blockOfWordObj.push([tag, word, termObj, normalizedWord]);

    return posText + 1;
  }

  function processSentence(sentence: string[], sentenceId: number, posText: number, windowSize: number, maxNgramSize: number): number {
    const blockOfWordObj: BlockWord[] = [];

    for (const [posSent, word] of sentence.entries()) {
      if ([...word].every((char) => exclude.has(char))) {
        blockOfWordObj.length = 0;
        continue;
      }

      posText = processWord(word, posText, sentenceId, posSent, blockOfWordObj, windowSize, maxNgramSize);
    }

    return posText;
  }

  const sentences = splitSentences(preFilter(text))
    .map((sentence) => tokenizeWords(sentence).filter((token) => !(startsWithApostrophe(token) && token.length > 1) && token.length > 0))
    .filter((sentence) => sentence.length > 0);

  let posText = 0;
  for (const [sentenceId, sentence] of sentences.entries()) {
    posText = processSentence(sentence, sentenceId, posText, config.windowSize, config.maxNgramSize);
  }

  return { graph, terms, candidates, numberOfSentences: sentences.length };
}

/**
 * Computes single-word YAKE features for every term in the document.
 */
export function scoreSingleTerms(document: Document): void {
  const validTerms = [...document.terms.values()].filter((term) => !term.stopword);
  if (validTerms.length === 0) {
    return;
  }

  const validTfs = validTerms.map((term) => term.tf);
  const avgTf = validTfs.reduce((sum, value) => sum + value, 0) / validTfs.length;
  const stdTf = Math.sqrt(validTfs.reduce((sum, value) => sum + ((value - avgTf) ** 2), 0) / validTfs.length);
  const maxTf = Math.max(...[...document.terms.values()].map((term) => term.tf));

  const stats = { maxTf, avgTf, stdTf, numberOfSentences: document.numberOfSentences };
  for (const term of document.terms.values()) {
    scoreTerm(term, document.graph, stats);
  }
}

/**
 * Computes multi-word YAKE features for every valid candidate.
 */
export function scoreAllCandidates(document: Document): void {
  for (const candidate of document.candidates.values()) {
    if (isValidCandidate(candidate)) {
      scoreCandidate(candidate, document.graph);
    }
  }
}

function startsWithApostrophe(token: string): boolean {
  return token.startsWith("'") || token.startsWith("’");
}

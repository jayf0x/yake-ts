/**
 * Text preprocessing: paragraph-aware normalization, sentence splitting,
 * word tokenization, and YAKE-style word tagging.
 *
 * Adapted from research/yaket/src/utils.ts — this is the fiddliest part of
 * the algorithm to get right (contraction handling, abbreviation-aware
 * sentence boundaries, Unicode word chars) so the logic is kept close to
 * the original rather than hand-rewritten from scratch.
 */

const CAPITAL_LETTER_PATTERN = /^(\s*([A-Z]))/;
const TOKEN_PATTERN = /\p{L}[\p{L}\p{M}\p{Nd}]*(?:(?:[.'’-]+|…+)[\p{L}\p{M}\p{Nd}]+)*|\p{Nd}+(?:[.,]\p{Nd}+)*|[^\s]/gu;
const ASCII_PUNCTUATION = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

/**
 * English abbreviations that should keep their trailing period attached
 * instead of being treated as a sentence boundary.
 *
 * Cross-referenced against segtok (the tokenizer yake-python actually
 * depends on: opt/homebrew/lib/python3.14/site-packages/segtok/segmenter.py,
 * the `ABBREVIATIONS` list). segtok's list is multi-language (German,
 * Spanish month names, etc.); this keeps only the English-relevant subset
 * plus honorifics segtok doesn't cover. This particular list stays
 * English-specific even though other languages' stopwords are supported
 * (see src/stopwords/) — abbreviation-aware sentence splitting isn't
 * per-language here, so non-English text just won't get this refinement.
 *
 * Deliberately excludes "may": segtok includes it as a month abbreviation,
 * but in short English chat/session text "may" is overwhelmingly the modal
 * verb ("you may."), and treating it as an abbreviation would wrongly merge
 * that sentence with the next one far more often than it would correctly
 * preserve a "May." date reference.
 */
const COMMON_ABBREVIATIONS = new Set([
  // Honorifics / titles
  "dr",
  "mr",
  "mrs",
  "ms",
  "msgr",
  "prof",
  "rev",
  "hon",
  "sr",
  "sra",
  "srta",
  "jr",
  "st",
  "capt",
  "col",
  "gen",
  "sgt",
  // Latin / general
  "etc",
  "e.g",
  "i.e",
  "vs",
  "cf",
  "al",
  "ca",
  "approx",
  // Numbering / citation
  "no",
  "nos",
  "nr",
  "vol",
  "ed",
  "pp",
  "fig",
  "figs",
  // Geographic
  "u.s",
  "u.k",
  "mt",
  // Academic
  "univ",
  "phil",
  "sci",
  // Months (except "may" — see doc comment above)
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
]);

const SENTENCE_CLOSERS = new Set([`"`, `'`, ")", "]", "}", "»", "”", "’"]);
const ATTACHED_TRAILING_PUNCTUATION = new Set(["؟"]);
const CONTRACTION_SUFFIXES = new Set(["'s", "'re", "'ve", "'ll", "'d", "'m", "’s", "’re", "’ve", "’ll", "’d", "’m"]);

/** Stopwords inside a multi-word candidate are scored via co-occurrence probability with their neighbors, not their own H. */
export const STOPWORD_WEIGHT = "bi" as const;
export const DEFAULT_EXCLUDE = new Set(ASCII_PUNCTUATION.split(""));

/**
 * Applies YAKE-style prefiltering before sentence/token processing.
 */
export const preFilter = (text: string): string => {
  const parts = text.split("\n");
  let buffer = "";

  for (const part of parts) {
    const separator = CAPITAL_LETTER_PATTERN.test(part) ? "\n\n" : " ";
    buffer += separator + part.replaceAll("\t", " ");
  }

  return buffer;
};

/**
 * Splits text into YAKE-style tokens.
 */
export const tokenizeWords = (text: string): string[] => {
  const tokens = text.match(TOKEN_PATTERN) ?? [];
  const expanded: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;

    if (token === ".") {
      const ellipsis = consumeEllipsis(tokens, index);
      if (ellipsis != null) {
        expanded.push(ellipsis.value);
        index = ellipsis.endIndex;
        continue;
      }
    }

    const nextToken = tokens[index + 1];
    const nextNextToken = tokens[index + 2];
    const tokenAfterCloser = tokens[index + 3];
    if (token === "…" && nextToken != null && SENTENCE_CLOSERS.has(nextToken)) {
      expanded.push(`${token}${nextToken}`);
      index += 1;
      continue;
    }

    if (nextToken === "." && shouldAttachTrailingPeriod(token, nextNextToken, tokenAfterCloser)) {
      expanded.push(...splitContractions(`${token}.`));
      index += 1;
      continue;
    }

    if (nextToken != null && ATTACHED_TRAILING_PUNCTUATION.has(nextToken) && shouldAttachTrailingPunctuation(token)) {
      expanded.push(...splitContractions(`${token}${nextToken}`));
      index += 1;
      continue;
    }

    expanded.push(...splitContractions(token));
  }

  return expanded;
};

/**
 * Splits text into sentence strings.
 */
export const splitSentences = (text: string): string[] => {
  const sentences: string[] = [];
  let start = 0;
  let index = 0;

  while (index < text.length) {
    if (text[index] === "\n" && text[index + 1] === "\n") {
      pushSentence(sentences, text.slice(start, index));
      start = skipWhitespace(text, index + 2);
      index = start;
      continue;
    }

    if (!isSentenceTerminal(text[index]!)) {
      index += 1;
      continue;
    }

    let end = index;
    while (end + 1 < text.length && text[end + 1] === text[end]) {
      end += 1;
    }
    while (end + 1 < text.length && SENTENCE_CLOSERS.has(text[end + 1]!)) {
      end += 1;
    }
    if (end + 1 < text.length && text[end + 1] === "." && text[end] !== ".") {
      end += 1;
    }

    const next = skipWhitespace(text, end + 1);
    if (shouldSplitSentence(text, start, index, next)) {
      pushSentence(sentences, text.slice(start, end + 1));
      start = next;
      index = next;
      continue;
    }

    index = end + 1;
  }

  pushSentence(sentences, text.slice(start));
  return sentences;
};

const splitContractions = (token: string): string[] => {
  const normalized = token.toLowerCase();
  const apostropheIndex = Math.max(normalized.lastIndexOf("'"), normalized.lastIndexOf("’"));

  if (apostropheIndex <= 0 || apostropheIndex >= token.length - 1) return [token];

  const base = token.slice(0, apostropheIndex);
  const suffix = token.slice(apostropheIndex);
  const normalizedSuffix = normalized.slice(apostropheIndex);

  if (CONTRACTION_SUFFIXES.has(normalizedSuffix)) {
    return base.length > 0 ? [base, suffix] : [token];
  }

  if (normalized.endsWith("n't") && base.length > 0) {
    return [token.slice(0, -3), token.slice(-3)];
  }

  return [token];
};

const consumeEllipsis = (tokens: string[], startIndex: number): { value: string; endIndex: number } | null => {
  let endIndex = startIndex;
  while (tokens[endIndex + 1] === ".") {
    endIndex += 1;
  }

  const dotCount = endIndex - startIndex + 1;
  return dotCount < 3 ? null : { value: ".".repeat(dotCount), endIndex };
};

const shouldAttachTrailingPeriod = (token: string, nextNextToken?: string, tokenAfterCloser?: string): boolean => {
  const normalized = token.toLowerCase();
  if (token.includes(".") || COMMON_ABBREVIATIONS.has(normalized)) return true;
  // Keep `word.` attached when a sentence closer follows AND there is more text after it.
  // When the closer is the last token of the input (e.g. `Histórias."` at end of a sentence)
  // the period is left as its own token instead.
  return nextNextToken != null && SENTENCE_CLOSERS.has(nextNextToken) && tokenAfterCloser != null;
};

const shouldAttachTrailingPunctuation = (token: string): boolean => /[\p{L}\p{M}\p{Nd}]$/u.test(token);

const isSentenceTerminal = (char: string): boolean => char === "." || char === "!" || char === "?";

const shouldSplitSentence = (
  text: string,
  sentenceStart: number,
  punctuationIndex: number,
  nextIndex: number,
): boolean => {
  if (nextIndex >= text.length) return true;

  const punctuation = text[punctuationIndex]!;
  if (punctuation !== ".") return nextIndex > punctuationIndex + 1;

  if (isDecimalPoint(text, punctuationIndex) || isInitialism(text, punctuationIndex)) return false;

  const previousWord = getPreviousWord(text, punctuationIndex).toLowerCase();
  if (COMMON_ABBREVIATIONS.has(previousWord)) return false;

  if (text[punctuationIndex + 1] === "»" && leadingSentenceChar(text, sentenceStart) === "«") return false;

  return nextIndex > punctuationIndex + 1;
};

const leadingSentenceChar = (text: string, sentenceStart: number): string => {
  let cursor = sentenceStart;
  while (cursor < text.length && /\s/u.test(text[cursor]!)) {
    cursor += 1;
  }
  return text[cursor] ?? "";
};

const isDecimalPoint = (text: string, punctuationIndex: number): boolean =>
  isDigit(text[punctuationIndex - 1] ?? "") && isDigit(text[punctuationIndex + 1] ?? "");

const isInitialism = (text: string, punctuationIndex: number): boolean => {
  const left = text.slice(0, punctuationIndex + 1);
  if (/(?:\b\p{L}\.){2,}$/u.test(left)) return true;

  return (
    isLetter(text[punctuationIndex - 1] ?? "") &&
    isLetter(text[punctuationIndex + 1] ?? "") &&
    text[punctuationIndex + 2] === "."
  );
};

const getPreviousWord = (text: string, punctuationIndex: number): string => {
  let start = punctuationIndex - 1;
  while (start >= 0 && isWordChar(text[start]!)) {
    start -= 1;
  }

  return text.slice(start + 1, punctuationIndex);
};

const isWordChar = (char: string): boolean => /^[\p{L}\p{M}\p{Nd}]$/u.test(char);

const skipWhitespace = (text: string, index: number): number => {
  let cursor = index;
  while (cursor < text.length && /\s/u.test(text[cursor]!)) {
    cursor += 1;
  }
  return cursor;
};

const pushSentence = (sentences: string[], sentence: string): void => {
  const trimmed = sentence.trim();
  if (trimmed.length > 0) sentences.push(trimmed);
};

/**
 * Returns the YAKE tag used for candidate generation and scoring:
 * "d" digit, "u" unusual (mixed alnum/punct), "a" acronym, "n" proper noun, "p" plain.
 */
export const getTag = (word: string, index: number, exclude: ReadonlySet<string>): string => {
  const withoutCommas = word.replaceAll(",", "");
  if (isNumeric(withoutCommas) || isNumeric(withoutCommas.replace(".", ""))) return "d";

  let digitCount = 0;
  let alphaCount = 0;
  let excludeCount = 0;

  for (const char of word) {
    if (isDigit(char)) digitCount += 1;
    if (isLetter(char)) alphaCount += 1;
    if (exclude.has(char)) excludeCount += 1;
  }

  if ((digitCount > 0 && alphaCount > 0) || (digitCount === 0 && alphaCount === 0) || excludeCount > 1) return "u";

  if (isAllUpper(word)) return "a";

  if (word.length > 1 && isUpper(word[0]!) && index > 0 && countUppercase(word) === 1) return "n";

  return "p";
};

const isNumeric = (value: string): boolean => /^\d+$/.test(value);

const isDigit = (char: string): boolean => /^\p{Nd}$/u.test(char);

const isLetter = (char: string): boolean => /^\p{L}$/u.test(char);

const isUpper = (char: string): boolean => char.toUpperCase() === char && char.toLowerCase() !== char;

const isAllUpper = (word: string): boolean => {
  let sawLetter = false;

  for (const char of word) {
    if (!isLetter(char)) continue;

    sawLetter = true;
    if (!isUpper(char)) return false;
  }

  return sawLetter;
};

const countUppercase = (word: string): number => {
  let count = 0;

  for (const char of word) {
    if (isUpper(char)) count += 1;
  }

  return count;
};

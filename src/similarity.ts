/**
 * Levenshtein edit distance and similarity ratio, used to suppress
 * near-duplicate keyword phrases during ranking.
 *
 * Deliberate simplification: upstream YAKE defaults to a heuristic
 * SequenceMatcher-style metric ("seqm"). This package uses plain
 * Levenshtein instead — simpler, no caching needed, same complexity class,
 * and close enough for short phrase deduplication. Upgrade path: swap the
 * comparator passed to dedupeCandidates() if a specific corpus needs closer
 * upstream parity.
 */

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  const aLength = a.length;
  const bLength = b.length;
  if (aLength === 0) {
    return bLength;
  }
  if (bLength === 0) {
    return aLength;
  }

  let previousRow = Array.from({ length: bLength + 1 }, (_, index) => index);
  let currentRow = new Array<number>(bLength + 1).fill(0);

  for (let i = 1; i <= aLength; i += 1) {
    currentRow[0] = i;

    for (let j = 1; j <= bLength; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow[j] = Math.min(
        previousRow[j]! + 1,
        currentRow[j - 1]! + 1,
        previousRow[j - 1]! + cost,
      );
    }

    [previousRow, currentRow] = [currentRow, previousRow];
  }

  return previousRow[bLength]!;
}

/**
 * Normalized similarity in [0, 1], where 1 means identical strings.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) {
    return 1;
  }

  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) {
    return 1;
  }

  return 1 - levenshteinDistance(a, b) / maxLength;
}

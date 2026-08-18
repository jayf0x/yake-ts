import { describe, expect, test } from "bun:test";
import { extractKeywords } from "../src/extract.ts";
import { STOPWORDS as SPANISH_STOPWORDS } from "../src/stopwords/es.ts";
import { STOPWORDS as FRENCH_STOPWORDS } from "../src/stopwords/fr.ts";

describe("non-English stopword sets", () => {
  test("are non-empty, lowercase, plain word sets", () => {
    for (const set of [FRENCH_STOPWORDS, SPANISH_STOPWORDS]) {
      expect(set.size).toBeGreaterThan(50);
      for (const word of set) {
        expect(word).toBe(word.toLowerCase());
      }
    }
  });

  test("plug into extractKeywords via the stopwords option", () => {
    const results = extractKeywords("le chat est sur la table et le chien est sous la table", {
      stopwords: FRENCH_STOPWORDS,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((k) => k.normalized === "chat" || k.normalized === "table")).toBe(true);
    expect(results.every((k) => !FRENCH_STOPWORDS.has(k.normalized))).toBe(true);
  });
});

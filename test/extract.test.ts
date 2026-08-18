import { describe, expect, test } from "bun:test";
import { extractKeywords } from "../src/extract.ts";

const KAGGLE_TEXT = `
Google is acquiring data science community Kaggle. Sources tell us that Google is acquiring Kaggle, a platform that hosts data science and machine learning
competitions. Details about the transaction remain somewhat vague, but given that Google is hosting its Cloud
Next conference in San Francisco this week, the official announcement could come as early as tomorrow.
Reached by phone, Kaggle co-founder CEO Anthony Goldbloom declined to deny that the acquisition is happening.
Google itself declined 'to comment on rumors'. Kaggle, which has about half a million data scientists on its platform,
was founded by Goldbloom  and Ben Hamner in 2010.
The service got an early start and even though it has a few competitors like DrivenData, TopCoder and HackerRank,
it has managed to stay well ahead of them by focusing on its specific niche.
The service is basically the de facto home for running data science and machine learning competitions.
With Kaggle, Google is buying one of the largest and most active communities for data scientists - and with that,
it will get increased mindshare in this community, too (though it already has plenty of that thanks to Tensorflow
and other projects). Kaggle has a bit of a history with Google, too, but that's pretty recent. Earlier this month,
Google and Kaggle teamed up to host a $100,000 machine learning competition around classifying YouTube videos.
That competition had some deep integrations with the Google Cloud Platform, too. Our understanding is that Google
will keep the service running - likely under its current name. While the acquisition is probably more about
Kaggle's community than technology, Kaggle did build some interesting tools for hosting its competition
and 'kernels', too. On Kaggle, kernels are basically the source code for analyzing data sets and developers can
share this code on the platform (the company previously called them 'scripts').
Like similar competition-centric sites, Kaggle also runs a job board, too. It's unclear what Google will do with
that part of the service. According to Crunchbase, Kaggle raised $12.5 million (though PitchBook says it's $12.75)
since its   launch in 2010. Investors in Kaggle include Index Ventures, SV Angel, Max Levchin, Naval Ravikant,
Google chief economist Hal Varian, Khosla Ventures and Yuri Milner
`;

describe("extractKeywords", () => {
  test("real article: non-empty, sorted ascending, within limit, recognizable top keyword", () => {
    const results = extractKeywords(KAGGLE_TEXT, { limit: 10 });

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(10);

    for (let i = 1; i < results.length; i += 1) {
      expect(results[i - 1]!.score).toBeLessThanOrEqual(results[i]!.score);
    }

    expect(results.some((k) => k.normalized === "google" || k.normalized === "kaggle")).toBe(true);

    for (const keyword of results) {
      expect(keyword.sentenceIds.length).toBeGreaterThan(0);
      expect([...keyword.sentenceIds].sort((a, b) => a - b)).toEqual(keyword.sentenceIds);
    }
  });

  test("empty input returns empty array", () => {
    expect(extractKeywords("")).toEqual([]);
  });

  test("all-stopword input returns empty array", () => {
    expect(extractKeywords("the a an is are was were")).toEqual([]);
  });

  test("short session-naming input returns something sane", () => {
    const results = extractKeywords("fix flaky auth test in login flow");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((k) => k.keyword.length > 0)).toBe(true);
  });

  test("dedupeThreshold: 1 disables dedup, so keeps >= as many candidates as default", () => {
    const withDedup = extractKeywords(KAGGLE_TEXT, { limit: 50 });
    const withoutDedup = extractKeywords(KAGGLE_TEXT, { limit: 50, dedupeThreshold: 1 });
    expect(withoutDedup.length).toBeGreaterThanOrEqual(withDedup.length);
  });
});

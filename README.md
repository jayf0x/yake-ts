# yake-ts

Tiny, dependency-free, English-only [YAKE](https://github.com/LIAAD/yake) keyword
extractor. No classes, no caching — a single pure function you can call inline,
e.g. to name a session from its first message.

## Install

```bash
npm install yake-ts
```

## Usage

```ts
import { extractKeywords } from "yake-ts";

const keywords = extractKeywords("fix flaky auth test in login flow");
// [{ keyword: "auth test", normalized: "auth test", score: 0.04, ngramSize: 2, occurrences: 1 }, ...]
```

Lower `score` means more relevant.

## Options

```ts
extractKeywords(text: string, options?: YakeTsOptions): Keyword[]
```

| Option             | Default            | Meaning                                                              |
| ------------------ | ------------------- | --------------------------------------------------------------------- |
| `maxNgramSize`      | `3`                  | Max words per candidate keyword phrase.                              |
| `windowSize`        | `1`                  | Co-occurrence window size for the relatedness feature.               |
| `dedupeThreshold`   | `0.9`                | Similarity ceiling above which a candidate is dropped as a near-duplicate. `1` disables dedup. |
| `limit`             | `10`                 | Max number of keywords to return.                                    |
| `stopwords`         | bundled English list | Stopwords to use. Pass your own set for other languages.             |

## Design notes

This is a trimmed, functional port of the algorithm core from
[`@ade_oshineye/yaket`](https://www.npmjs.com/package/@ade_oshineye/yaket),
vendored rather than depended on. Deliberate simplifications:

- **English-only** by default — bundling all 34 of yaket's languages isn't
  tree-shakeable through its public API, so we ship just English and let you
  bring your own `stopwords` set for anything else.
- **No classes** — everything runs once per `extractKeywords()` call, so
  there's no object to reuse or subclass. Plain interfaces + functions
  throughout.
- **No caching** — same reasoning: nothing is computed more than once per
  call, so a cache would only add invalidation bugs for no benefit.
- **Levenshtein-only dedup**, not yaket's pluggable `seqm`/`levs`/`jaro`
  choice — one well-understood algorithm, good enough for deduping short
  candidate phrases, instead of three.

Zero runtime dependencies.

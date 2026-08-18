# yake-ts

<!-- README_HEAD:START -->

[![npm version](https://img.shields.io/npm/v/yake-ts)](https://www.npmjs.com/package/yake-ts)
[![types](https://img.shields.io/npm/types/yake-ts)](./src/index.ts)
[![CI](https://github.com/jayf0x/yake-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/jayf0x/yake-ts/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/yake-ts)](./LICENSE)

<!-- README_HEAD:END -->

Tiny, dependency-free, English-only [YAKE](https://github.com/LIAAD/yake) keyword extractor. No
classes, no caching — a single pure function you can call inline, e.g. to name a session from its
first message.

## Why not just use `yake-js` / a full NLP library?

|                 | yake-ts                            | `@ade_oshineye/yaket`         | spaCy / a full NLP stack     |
| --------------- | ----------------------------------- | ------------------------------ | ----------------------------- |
| Runtime deps    | zero                                 | zero, but 34 bundled languages | tokenizers, models, sometimes native bindings |
| Bundle surface  | one pure function                    | class + provider + cache layer | an entire pipeline             |
| Languages       | English (bring your own stopwords)   | 34, not tree-shakeable via the public API | most, via models |
| Setup           | `extractKeywords(text)`              | instantiate + configure a class | load a model, build a pipeline |

Use a full NLP stack when you need POS tagging, NER, or multi-language support out of the box.
Reach for this when you just want a fast, unsupervised keyword list from a short piece of text.

## What's new

<!-- WHATSNEW:START -->
| Version | Highlights |
| ------- | ---------- |
| `0.1.0` | Initial release — `extractKeywords`, zero-dependency English YAKE |
<!-- WHATSNEW:END -->

Full history in [CHANGELOG.md](./CHANGELOG.md).

## Install

```bash
npm install yake-ts   # bun / pnpm / yarn all fine
```

## Quick start

```ts
import { extractKeywords } from "yake-ts";

const keywords = extractKeywords("fix flaky auth test in login flow");
// [{ keyword: "auth test", normalized: "auth test", score: 0.04, ngramSize: 2, occurrences: 1 }, ...]
```

Lower `score` means more relevant.

## The rules

Three things, and you've seen the whole tool.

**1 · Unsupervised, per-call.** No training, no corpus, no model to load — `extractKeywords`
scores candidate phrases purely from statistics of the input text itself (frequency, casing,
position, co-occurrence). Call it fresh every time; there's nothing to warm up or reuse.

**2 · English by default, bring your own stopwords for anything else.** Bundling all of YAKE's
languages isn't tree-shakeable through a package's public API, so this ships just English. Pass
your own `stopwords` set to extract from other languages.

**3 · Lower score wins.** Unlike most ranking APIs, `score` is a cost, not a relevance percentage —
sort ascending, and the first result is the strongest keyword.

## API

```ts
extractKeywords(text: string, options?: YakeTsOptions): Keyword[]
```

### Options

| Option             | Type                | Default               | What it does                                                                                    |
| ------------------ | ------------------- | ---------------------- | -------------------------------------------------------------------------------------------------- |
| `maxNgramSize`      | `number`             | `3`                     | Max words per candidate keyword phrase.                                                            |
| `windowSize`        | `number`             | `1`                     | Co-occurrence window size for the relatedness feature.                                             |
| `dedupeThreshold`   | `number`             | `0.9`                   | Similarity ceiling above which a candidate is dropped as a near-duplicate. `1` disables dedup.      |
| `limit`             | `number`             | `10`                    | Max number of keywords to return.                                                                  |
| `stopwords`         | `Iterable<string>`   | bundled English list    | Stopwords to use. Pass your own set for other languages.                                           |

### `Keyword`

| Field         | Type     | Meaning                                                |
| ------------- | -------- | ------------------------------------------------------- |
| `keyword`     | `string` | Surface form as it appeared in the source text.         |
| `normalized`  | `string` | Lowercased form used for matching/deduplication.        |
| `score`       | `number` | YAKE score — lower is more relevant.                    |
| `ngramSize`   | `number` | Number of words in the phrase.                          |
| `occurrences` | `number` | How many times the phrase occurred in the source text.  |

## Design notes

This is a trimmed, functional port of the algorithm core from
[`@ade_oshineye/yaket`](https://www.npmjs.com/package/@ade_oshineye/yaket), vendored rather than
depended on. Deliberate simplifications:

- **English-only** by default — bundling all 34 of yaket's languages isn't tree-shakeable through
  its public API, so we ship just English and let you bring your own `stopwords` set for anything
  else.
- **No classes** — everything runs once per `extractKeywords()` call, so there's no object to
  reuse or subclass. Plain interfaces + functions throughout.
- **No caching** — same reasoning: nothing is computed more than once per call, so a cache would
  only add invalidation bugs for no benefit.
- **Levenshtein-only dedup**, not yaket's pluggable `seqm`/`levs`/`jaro` choice — one
  well-understood algorithm, good enough for deduping short candidate phrases, instead of three.

Zero runtime dependencies.

## Development

```bash
bun install
bun run test        # bun test
bun run typecheck    # tsc --noEmit
bun run build        # vite → dist/
bun run format        # biome check --write
```

## License

[MIT](./LICENSE) © [jayF0x](https://github.com/jayf0x)

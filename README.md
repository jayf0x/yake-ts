# yake-ts

<!-- README_HEAD:START -->

[![npm version](https://img.shields.io/npm/v/yake-ts)](https://www.npmjs.com/package/yake-ts)
[![types](https://img.shields.io/npm/types/yake-ts)](./src/index.ts)
[![CI](https://github.com/jayf0x/yake-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/jayf0x/yake-ts/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/yake-ts)](./LICENSE)

<!-- README_HEAD:END -->

**Text in, ranked keywords out.** 🔑

`yake-ts` implements [YAKE](https://github.com/LIAAD/yake) — an unsupervised keyword extractor that
scores candidate phrases from statistics of one document alone: word frequency, casing, position,
spread across sentences, and co-occurrence. No model, no corpus, no training, no network call.

```ts
import { extractKeywords } from "yake-ts";

extractKeywords("fix flaky auth test in login flow")[0].keyword; // "fix flaky auth"
```

One function, zero runtime dependencies, ~5.7 kB gzipped including the English stopword list.
33 more languages are separate imports you only pay for if you use them.

## Picking a package

Several JS keyword extractors exist and they solve genuinely different problems:

| Package | What you get | What it costs |
| --- | --- | --- |
| **`yake-ts`** | YAKE scores from a single call; English inline, 33 languages opt-in; ESM, edge/browser-safe | young and unproven; Levenshtein-only dedup; no CJK segmentation |
| [`@ade_oshineye/yaket`](https://www.npmjs.com/package/@ade_oshineye/yaket) | the same algorithm, plus scorer/tokenizer hooks, CLI, highlighter, Bobbin adapter, Python-parity + Cloudflare test lanes, benchmarks | ~370 kB unpacked, all 34 stopword sets reachable through one API; Node 20+; a much bigger API to learn |
| [`yake-wasm`](https://www.npmjs.com/package/yake-wasm) | YAKE in Rust/WASM; fast on long documents; drops n-gram substrings so "data science" wins over "data" | a WASM init step in your bundler; stopwords are English-only and not configurable; last published 2022 |
| [`retext-keywords`](https://github.com/retextjs/retext-keywords) | part-of-speech-aware keywords *and* keyphrases inside a [unified](https://unifiedjs.com) pipeline | needs `unified` + `retext` + `retext-pos`; ~5 dependencies; results come back as stems on a vfile |
| [`keyword-extractor`](https://www.npmjs.com/package/keyword-extractor) | stopword removal in 20 languages, battle-tested (~220k downloads/week) | no ranking — you get a filtered word list, not keywords ordered by importance |

Short version: `keyword-extractor` if you only need stopwords gone, `retext-keywords` if you are
already in the unified ecosystem, `yaket` if you need the extension points or upstream parity,
`yake-ts` if you want YAKE's ranking in the smallest possible bundle with one import.

For POS tagging, NER, or CJK word segmentation, use a real NLP stack (spaCy, `wink-nlp`) — none of
the above do that.

## What's new

<!-- WHATSNEW:START -->
| Version | Highlights |
| ------- | ---------- |
| `1.2.0` | Tiny, dependency-free YAKE keyword extractor—one function, 34 languages, zero classes |
| `0.1.0` | Initial release — `extractKeywords`, zero-dependency YAKE, English bundled + 33 more languages as subpath imports |
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
// [
//   { keyword: "fix flaky auth", normalized: "fix flaky auth", score: 0.017,
//     ngramSize: 3, occurrences: 1, sentenceIds: [0] },
//   ...
// ]
```

Results come back sorted, best first. Typical uses: tagging notes or CMS entries, naming a chat
session from its first message, enriching search/RAG chunks without an LLM call.

## The rules

Three things, and you've seen the whole tool.

**1 · Lower score wins.** `score` is a cost, not a relevance percentage. The list is already sorted
ascending, so `[0]` is the strongest keyword — don't re-sort it descending.

**2 · Everything happens per call.** Scores come from the input text alone, so there is nothing to
load, warm up, or reuse between calls. Pass a whole document rather than one sentence at a time:
YAKE's position and spread features need more than one sentence to say anything.

**3 · A language is a stopword list, not a tokenizer.** Pass another language's set via the
`stopwords` option and phrase detection adapts; word splitting stays the same Unicode
word-boundary scan. Fine for space-delimited scripts, not for unsegmented Chinese or Japanese —
see [Languages](#languages).

## API

```ts
extractKeywords(text: string, options?: YakeTsOptions): Keyword[]
```

### Options

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `maxNgramSize` | `number` | `3` | Max words per candidate keyword phrase. |
| `windowSize` | `number` | `1` | Co-occurrence window size for the relatedness feature. |
| `dedupeThreshold` | `number` | `0.9` | Similarity ceiling above which a candidate is dropped as a near-duplicate. `1` disables dedup. |
| `limit` | `number` | `10` | Max number of keywords to return. |
| `stopwords` | `Iterable<string>` | bundled English | Stopword set to use — see [Languages](#languages), or pass your own. |

### `Keyword`

| Field | Type | Meaning |
| --- | --- | --- |
| `keyword` | `string` | Surface form as it appeared in the source text. |
| `normalized` | `string` | Lowercased form used for matching and deduplication. |
| `score` | `number` | YAKE score — lower is more relevant. |
| `ngramSize` | `number` | Number of words in the phrase. |
| `occurrences` | `number` | How many times the phrase occurred in the text. |
| `sentenceIds` | `number[]` | Zero-based indices of the sentences it occurs in, ascending. |

## Languages

English is bundled and used by default. 33 more ship as stopword-only subpath exports, so a
consumer who never imports one pays zero bytes for it:

```ts
import { extractKeywords } from "yake-ts";
import { STOPWORDS as FRENCH } from "yake-ts/stopwords/fr";

extractKeywords("le chat est sur la table", { stopwords: FRENCH });
```

Available codes: `ar`, `bg`, `br`, `cz`, `da`, `de`, `el`, `es`, `et`, `fa`, `fi`, `fr`, `hi`, `hr`,
`hu`, `hy`, `id`, `it`, `ja`, `lt`, `lv`, `nl`, `no`, `pl`, `pt`, `ro`, `ru`, `sk`, `sl`, `sv`,
`tr`, `uk`, `zh` (vendored from `@ade_oshineye/yaket`'s stopword bundle).

**CJK needs pre-segmentation.** Tokenization is a Unicode word-boundary scan, so Chinese and
Japanese text — which has no spaces between words — comes back as one run-on token per script run,
and the `zh`/`ja` stopword lists can't fix that. Segment it yourself (e.g. with `Intl.Segmenter`)
and space-join the result before calling `extractKeywords`.

## Limitations

- **Not byte-for-byte upstream YAKE.** It is a port of a port: the algorithm core comes from
  [`@ade_oshineye/yaket`](https://www.npmjs.com/package/@ade_oshineye/yaket), vendored rather than
  depended on, which itself documents drift from Python YAKE's `segtok` tokenizer. Expect the same
  top keywords, not identical float scores.
- **Dedup is Levenshtein similarity only**, where yaket lets you choose `seqm`, `levs`, or `jaro`.
  Good enough for short candidate phrases; if you need Python's `seqm` behavior, use yaket.
- **Single documents only.** No corpus statistics, no TF-IDF across a collection, no topic modeling.
- **Short input gives thin results.** A five-word title has almost no statistics to score.
- **No lemmatization or POS filtering**, so plural and singular forms rank as separate candidates.

## Credits

The algorithm is from the YAKE paper: Campos, Mangaravite, Pasquali, Jorge, Nunes, Jatowt,
*YAKE! Keyword Extraction from Single Documents using Multiple Local Features*, Information
Sciences 509 (2020), 257–289 — [10.1016/j.ins.2019.09.013](https://doi.org/10.1016/j.ins.2019.09.013).
Reference implementation: [LIAAD/yake](https://github.com/LIAAD/yake). The TypeScript core and the
stopword bundle are adapted from [`@ade_oshineye/yaket`](https://github.com/adewale/yaket) (MIT).

## Development

```bash
bun install
bun run test         # bun test
bun run typecheck    # tsc --noEmit
bun run build        # vite → dist/
bun run format       # biome check --write
```

## License

[MIT](./LICENSE) © [jayF0x](https://github.com/jayf0x)

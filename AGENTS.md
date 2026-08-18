# AGENTS.md

Working notes for agents/contributors on `yake-ts`.

## What this is

A tiny, dependency-free, English-only [YAKE](https://github.com/LIAAD/yake) keyword extractor.
One pure function — `extractKeywords(text, options?)` — no classes, no caching, nothing to
instantiate. Trimmed, functional port of the algorithm core from
[`@ade_oshineye/yaket`](https://www.npmjs.com/package/@ade_oshineye/yaket), vendored rather than
depended on.

## Mental model

The pipeline, in call order (`src/extract.ts` orchestrates all of it):

1. **Tokenize** (`src/internal/tokenize.ts`) — paragraph-aware prefiltering, sentence splitting,
   word tokenization (contractions, abbreviations, Unicode word chars), and per-word tagging
   (`d` digit, `u` unusual, `a` acronym, `n` proper noun, `p` plain).
2. **Build document** (`src/internal/data-core.ts`) — walks tokenized sentences, creates a
   `TermState` per unique word (`src/internal/single-word.ts`), builds n-gram `Candidate`s
   (`src/internal/composed-word.ts`), and records co-occurrence edges in a directed graph
   (`src/internal/graph.ts`).
3. **Score terms** — single-word YAKE features (casing, position, frequency, relatedness,
   spread) reduced to one `h` score per term, lower is better.
4. **Score candidates** — combines member terms' `h` scores (with a co-occurrence-probability
   correction for stopwords inside a phrase) into one `h` per candidate phrase.
5. **Filter + sort + dedupe** (`src/extract.ts`) — drops invalid candidates (digit/unusual tags,
   starts/ends with a stopword), sorts ascending by score, then greedily dedupes near-identical
   phrases via `levenshteinSimilarity` (`src/similarity.ts`) up to `dedupeThreshold`.

`resolveOptions` (`src/config.ts`) turns the public `YakeTsOptions` into a fully-defaulted,
validated `ResolvedOptions` before any of the above runs.

## Layout

- `src/index.ts` — package entry; re-exports exactly what the public API is: `extractKeywords`,
  `Keyword`, `YakeTsOptions`. Nothing internal (stopword lists, tokenizer internals, graph) is
  re-exported here — see the `stopwords` option instead of `ENGLISH_STOPWORDS` if you need to
  extend the default list.
- `src/extract.ts` — the public `extractKeywords` function and the `Keyword` result shape.
- `src/config.ts` — `YakeTsOptions` (public), `ResolvedOptions` (internal), and `resolveOptions`.
- `src/similarity.ts` — Levenshtein distance/similarity, used only for dedup.
- `src/stopwords-en.ts` — bundled English stopword set (default `stopwords` value).
- `src/internal/` — the algorithm core: `tokenize.ts`, `graph.ts`, `single-word.ts`,
  `composed-word.ts`, `data-core.ts`. Not exported from `src/index.ts`.
- `test/extract.test.ts` — behavioral tests against `extractKeywords`, run with `bun test`.

## Commands

```bash
bun test               # run all tests (bun:test)
bun run typecheck      # tsc --noEmit
bun run build          # vite lib build → dist/index.{js,d.ts}
bun run format          # biome check --write
```

## Conventions

- Zero runtime dependencies. Keep it that way — this package's whole value proposition is being
  droppable into anything without pulling a dependency tree along.
- No classes anywhere. Every internal module is plain interfaces + functions operating on
  records created once per `extractKeywords()` call — there's no reuse across calls that would
  justify an instantiable object.
- English-only by default (see `src/stopwords-en.ts` for why bundling every language isn't
  tree-shakeable) — bring your own `stopwords` set for other languages via the option, don't add
  more bundled language files.
- Biome for format/lint (`biome.json` → `config/biome.json`). TS strict.
- `config/vite.config.ts` builds `src/index.ts` only — internal modules are inlined into the
  single `dist/index.js`, never published as separate entry points.

## History

Ported from `research/yaket` (see `.research/` for the original TypeScript source and
`.research/yake-python` for the reference Python implementation this traces back to) — if
something here looks over-abstracted for a single-function package, check whether it's a
leftover from that port rather than something added here.

# AGENTS.md

Working notes for agents/contributors on `yake-ts`.

## What this is

A tiny, dependency-free [YAKE](https://github.com/LIAAD/yake) keyword extractor. One pure
function — `extractKeywords(text, options?)` — no classes, no caching, nothing to instantiate.
Trimmed, functional port of the algorithm core from
[`@ade_oshineye/yaket`](https://www.npmjs.com/package/@ade_oshineye/yaket), vendored rather than
depended on.

English is bundled and used by default. 33 more languages ship as opt-in, tree-shakeable subpath
exports (`yake-ts/stopwords/<code>`, e.g. `yake-ts/stopwords/fr`) — see `src/stopwords/`. The
*tokenizer* itself stays whitespace/word-boundary based and isn't per-language, so this covers
space-delimited languages (Latin, Cyrillic, Greek, Arabic, Devanagari scripts, ...) reasonably
well; it does not do CJK word segmentation, so `zh`/`ja` stopwords only help if you pre-segment
that text yourself first (see the caveat comment in those two files).

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
  `Keyword`, `YakeTsOptions`. Nothing internal (tokenizer internals, graph) is re-exported here.
- `src/extract.ts` — the public `extractKeywords` function and the `Keyword` result shape.
- `src/config.ts` — `YakeTsOptions` (public), `ResolvedOptions` (internal), and `resolveOptions`.
- `src/similarity.ts` — Levenshtein distance/similarity, used only for dedup.
- `src/stopwords/` — one file per language, each exporting a single `STOPWORDS: ReadonlySet<string>`.
  `en.ts` is the default (bundled into the main entry, used automatically when `stopwords` is
  omitted); every other file is published as its own subpath export
  (`yake-ts/stopwords/<code>`, e.g. `yake-ts/stopwords/fr`) — pass its `STOPWORDS` set as the
  `stopwords` option to extract from that language. Not re-exported from `src/index.ts`, so an
  English-only consumer never pulls in the other 33 files. New languages: add
  `src/stopwords/<code>.ts` following the existing files' shape; the build and `package.json`
  exports both pick up new files automatically (see below), nothing else to wire up.
- `src/internal/` — the algorithm core: `tokenize.ts`, `graph.ts`, `single-word.ts`,
  `composed-word.ts`, `data-core.ts`. Not exported from `src/index.ts`.
- `test/extract.test.ts` — behavioral tests against `extractKeywords`, run with `bun test`.
- `test/stopwords.test.ts` — sanity checks on the non-English stopword sets and their integration
  via the `stopwords` option.

## Commands

```bash
bun test               # run all tests (bun:test)
bun run typecheck      # tsc --noEmit
bun run build          # vite lib build → dist/index.{js,d.ts} + dist/stopwords/<code>.js per language
bun run docs           # regenerate README.md's tables/examples/size from real source+build output
bun run format          # biome check --write
```

## Conventions

- Zero runtime dependencies. Keep it that way — this package's whole value proposition is being
  droppable into anything without pulling a dependency tree along.
- No classes anywhere. Every internal module is plain interfaces + functions operating on
  records created once per `extractKeywords()` call — there's no reuse across calls that would
  justify an instantiable object.
- English is the only stopword set bundled into the main entry point; other languages are
  tree-shakeable subpath exports (see `src/stopwords/` above) — a consumer who never imports
  `yake-ts/stopwords/*` pays zero bytes for the other 33 languages. Don't re-export them from
  `src/index.ts`, that would defeat the tree-shaking.
- Biome for format/lint (`biome.json` → `config/biome.json`). TS strict.
- `bun run build` runs two separate Vite configs (`config/vite.config.ts`, then
  `config/vite.stopwords.config.ts`): `src/index.ts` gets a `vite-plugin-dts` (`rollupTypes: true`)
  pass, `src/stopwords/*.ts` (except `en.ts`, inlined into the main entry) is a JS-only pass with
  no dts plugin at all. Internal `src/internal/` modules are still inlined wherever they're used,
  never published as separate entry points. The `stopwords/*` subpath exports' `types` condition
  points straight at the `.ts` source (`src/stopwords/*.ts`, shipped via `files`) rather than a
  generated `.d.ts` — `vite-plugin-dts`'s `rollupTypes` doesn't self-contain secondary entries (it
  emits a relative `export * from '../src/...'` re-export, which breaks under `NodeNext`/`node16`
  module resolution on the consumer's side), and these files are simple enough that a rolled-up
  declaration buys nothing. Running dts across all 34 entries anyway used to print
  `vite-plugin-dts`'s "Analysis will use the bundled TypeScript version" banner once per entry and
  leave 33 dead `.d.ts` files in `dist/` — splitting the build in two is what keeps that from
  happening, not a config tweak on a single build. Verified working under `NodeNext` before relying
  on it — see git history if this needs re-verifying after a `vite-plugin-dts` upgrade.
- `scripts/docs/sync-readme.ts` (`bun run docs`) keeps README.md's API tables, language list,
  bundle size, and code-example output generated from real source/build state rather than
  hand-typed — see the file's own header comment. Runs automatically as part of
  `scripts/npm/publish-npm.sh`. Not `type-to-table`: that tool resolves props off a rendering
  component via `react-docgen-typescript`, and `YakeTsOptions`/`Keyword` are plain interfaces with
  no component anchoring them, so it doesn't apply here — this uses the TS compiler API directly
  instead.

## History

Ported from `research/yaket` (see `.research/` for the original TypeScript source and
`.research/yake-python` for the reference Python implementation this traces back to) — if
something here looks over-abstracted for a single-function package, check whether it's a
leftover from that port rather than something added here.

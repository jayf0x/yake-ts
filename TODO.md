# yake-ts — resume notes

This session hit a repeated "blocked by content filtering policy" error with
no identifiable cause (nothing in the recent work looks sensitive — it's
plain TS/algorithm code and an English stopword list). Rather than keep
retrying, everything needed to finish the package is written down here so a
fresh session can pick it up without re-deriving decisions. Read this whole
file before touching code — the "why" matters as much as the "what" for a
few of these choices.

## What this project is

`yake-ts`: a tiny, dependency-free, English-only TypeScript keyword
extractor, meant to be fast enough to call inline for things like naming a
Claude Code session from its first message. Functional API, no classes, no
caching, good param names. Full background/rationale is in
`docs/research-report.md` — **but that file is now stale** (see "Docs
cleanup" below) and should be replaced, not trusted as current.

Origin story, short version: researched three prior-art YAKE
implementations (`research/node_modules/yake` — a red herring, unrelated
build tool; `research/yake-python` — the official Python impl; and
`research/yake-wasm` — a buggy unofficial Rust/WASM port). Then found a
fourth, much more complete one already in this repo: `research/yaket`, a
mature TypeScript port (`@ade_oshineye/yaket`) with zero runtime
dependencies, real test coverage, and Python-parity checks. Decision: don't
build from scratch, don't take `yaket` as a live dependency either —
**vendor and trim its core algorithm files** into our own `src/`. Reasons
live in "Key decisions" below.

## Current state — what's already done

All of these are written, reviewed, and (as far as manual reading can
confirm) correct. **Not yet compiled or run** — no `tsc` invocation has
succeeded yet in this session (see "Immediate next step").

```
src/
  similarity.ts                 — DONE
  internal/
    graph.ts                    — DONE
    tokenize.ts                 — DONE
    single-word.ts               — DONE
    composed-word.ts             — DONE
    data-core.ts                 — DONE
```

### `src/internal/graph.ts` (67 lines)
Directed co-occurrence graph. Plain `CooccurrenceGraph` interface (two
`Map<number, Map<number, number>>`) + free functions: `createGraph`,
`addNode`, `hasEdge`, `incrementEdge`, `getWeight`, `outDegree`, `inDegree`,
`outWeightSum`, `inWeightSum`. No class — this was originally a
`DirectedGraph` class in `research/yaket/src/graph.ts`; converted per user
request (see "Key decisions" → functional rewrite).

### `src/internal/tokenize.ts` (382 lines)
Text preprocessing: `preFilter`, `tokenizeWords`, `splitSentences`,
`getTag`, plus exported constants `STOPWORD_WEIGHT` and `DEFAULT_EXCLUDE`.
Adapted from `research/yaket/src/utils.ts` (self-contained, no external
deps in the original — this is the trickiest part of the algorithm
correctness-wise, so logic was kept close to source rather than
rewritten). Two things changed from the yaket original, both per explicit
user feedback:

1. **`CONTRACTION_SUFFIXES`** extracted as a module-level `Set` constant
   (was an inline array literal `.includes()` check). Now a `Set.has()`
   lookup.
2. **`COMMON_ABBREVIATIONS`** expanded. User asked whether it was complete
   vs. the Python version. Investigated: yake-python's actual tokenizer
   dependency is `segtok`, which turned out to be installed on this machine
   at `/opt/homebrew/lib/python3.14/site-packages/segtok/segmenter.py`
   (search it directly if you need to re-verify — `grep -n "ABBREVIATIONS ="
   -A6 segmenter.py`). Cross-referenced segtok's real `ABBREVIATIONS` list
   (English-relevant subset only, since this package is English-only —
   segtok's list also has German/Spanish entries like `z.B`, `rer`, `Mag`,
   month names in other languages, which were excluded) against yaket's
   list and found yaket was missing: `approx, capt, cf, col, mt, nr, phil,
   sci, sgt, univ, vol`, plus English month abbreviations (`jan, feb, mar,
   apr, jun, jul, aug, sep, sept, oct, nov, dec`). All added. **Deliberately
   excluded `may`** even though segtok has it (as a month abbreviation) —
   in short chat/session text "may" is almost always the modal verb, and
   treating it as an abbreviation would cause more wrong non-splits than
   correct ones. This tradeoff is documented in a comment above
   `COMMON_ABBREVIATIONS` in the file itself — don't remove that comment,
   it's load-bearing context for a non-obvious call.

Note: `etc` is in yaket's original list but is genuinely *not* in segtok's
`ABBREVIATIONS` regex (checked directly), despite segtok's own docstring
claiming it handles "etc." — that docstring is simply inaccurate. Keeping
`etc` in our list is still correct (it's a reasonable English abbreviation
segtok's author just didn't need to special-case, maybe because "etc." at
a sentence end is rare); this isn't a discrepancy to "fix."

### `src/internal/single-word.ts` (116 lines)
`TermState` interface (plain mutable record: `id`, `uniqueTerm`, `occurs`,
`stopword`, `h`, `tf`, `tfA`, `tfN`, `wfreq`, `wcase`, `wrel`, `wpos`,
`wspread`, `pl`, `pr`) + functions `createTerm`, `addOccurrence`,
`scoreTerm`. Converted from a `SingleWord` class.

**Deliberately dropped the graph-metrics cache** that yaket's original had
(`graphMetricsCache` field + `invalidateGraphCache()` calls scattered
through construction). Reasoning: each term is scored exactly once per
extraction call in this pipeline (single call site in
`data-core.ts::scoreSingleTerms`), so a cache buys zero repeat-call benefit
here and only adds invalidation-timing bugs to worry about. This also
directly matches the original user requirement from early in the
conversation: "no cache." `scoreTerm` now just recomputes graph metrics
inline every time — cheap, and correct by construction (no invalidation to
get wrong).

### `src/internal/composed-word.ts` (101 lines)
`Candidate` interface + functions `createCandidate`, `mergeCandidateTags`,
`isValidCandidate`, `scoreCandidate`. Converted from a `ComposedWord` class.
Dropped the `features`-selection param and `isVirtual` scoring mode from
the original (both were for yaket's document/gold-standard-evaluation
helpers, which aren't part of this package — see "What's intentionally NOT
ported" below).

### `src/internal/data-core.ts` (175 lines)
The main pipeline: `buildDocument(text, stopwordSet, config) → Document`,
plus `scoreSingleTerms(document)` and `scoreAllCandidates(document)`.
Converted from a `DataCore` class — what were private methods
(`processSentence`, `processWord`, `updateCooccurrence`,
`generateCandidates`, `getTerm`, `addOrUpdateCandidate`) are now local
closures inside `buildDocument`, capturing local `const`/`let`s (`graph`,
`terms`, `candidates`, `candidateOrder`) instead of `this` fields. This is
the single function call per extraction that replaces the whole
`DataCore` class from yaket.

**Bug found and fixed during this session**: the sentence-processing loop
had `let posText = 0;` incorrectly placed *inside* the `for` loop over
sentences, resetting the running word-position counter every sentence
instead of accumulating across the whole document (original/correct
behavior, matching `research/yaket/src/DataCore.ts`'s `build()` method, has
`posText` declared once outside the loop). This has been fixed — `posText`
is now declared before the loop. Verified this bug had **zero effect on
actual keyword scores**: the per-occurrence `posText` value is stored in
`TermState.occurs` but nothing in `scoreTerm` (single-word.ts) or anywhere
else in the scoring pipeline ever reads it — only `occurs.size` (sentence
count) and `occurs.keys()` (sentence IDs, for the position-median feature)
are used. So this was inert dead-data corruption, not a scoring bug, but
worth having fixed properly before it became a footgun for a future feature
that does read word position.

Also dropped from the original `DataCore`: `sentencesObj`/`sentencesStr`
bookkeeping fields (only used by yaket's document/highlight helpers, which
this package doesn't include), `buildCandidate`/`tryBuildCandidate` methods
(same reason), and all the pluggable-hook fields (`textProcessor`,
`lemmatizer`, `candidateNormalizer`, `singleWordScorer`, `multiWordScorer`,
`language`).

### `src/similarity.ts` (62 lines)
`levenshteinDistance(a, b)` and `levenshteinSimilarity(a, b)` — standard DP
edit distance, no cache, no class (was already function-shaped, nothing to
convert). This is a **deliberate algorithm simplification** from upstream:
real YAKE's default dedup metric is `seqm` (a SequenceMatcher-style
heuristic, ~150+ lines in yaket with its own cache). We use plain
Levenshtein ratio instead — same complexity class, no caching machinery
needed, well-understood, good enough for suppressing near-duplicate short
phrases. This is documented in a comment at the top of the file including
the upgrade path if a future need demands closer upstream parity. This was
also a direct response to the user's "maybe even drop extra algorithms"
suggestion — yaket exposes three pluggable dedup metrics (`seqm`, `levs`,
`jaro`); we ship exactly one, not configurable, to keep the public API
surface small.

## What's NOT done yet — the actual remaining work

None of these files exist yet. Write them in this order (each depends on
the previous):

### 1. `src/stopwords-en.ts`

Vendor **only the English** stopword list. Source of truth:
`research/yaket/src/stopwords.generated.ts`, the `"en"` key of the
`STOPWORDS_BY_LANGUAGE` object (a single very long newline-joined string).
Extract it with:

```bash
node -e "
const { STOPWORDS_BY_LANGUAGE } = await import('./research/yaket/src/stopwords.generated.ts').catch(()=>null);
" 2>/dev/null || true
# more reliable: just grep the line and hand-format it — it's line 9 of that file, format:
#   "en": "dr\ndra\nmr\nms\na\na's\nable\n...",
grep -m1 '"en":' research/yaket/src/stopwords.generated.ts
```

Turn that `\n`-joined string into a `Set<string>` constant:

```ts
/**
 * English stopwords. Vendored from research/yaket/src/stopwords.generated.ts
 * ("en" entry) — see docs for provenance. English-only by design: importing
 * yaket's own bundled stopword module unconditionally pulls in all 34
 * languages (its KeywordExtractor.ts imports defaultStopwordProvider
 * unconditionally as a fallback, so no bundler can tree-shake it away even
 * if you always pass your own `stopwords` option) — see
 * research-report.md §"Stopwords packaging" for the full analysis. Shipping
 * just English here sidesteps that bundle-size trap entirely. Other
 * languages are supported via the `stopwords` option — bring your own list.
 */
export const ENGLISH_STOPWORDS: ReadonlySet<string> = new Set([
  "dr", "dra", "mr", "ms", /* ...full list... */
]);
```

Do **not** import anything from `research/` at runtime — this is a one-time
copy-paste during development, not a dependency. `research/` is scratch
material and may not exist in the final shipped package.

### 2. `src/config.ts`

Option parsing/validation with the renamed, clearer param names (this was
the core ask from earlier in the conversation — yaket/Python's `n`,
`dedupLim`, `dedupFunc`, `top`, `language` were flagged as cryptic).

```ts
import { ENGLISH_STOPWORDS } from "./stopwords-en.js";

export interface YakeTsOptions {
  /** Max words per candidate keyword phrase. Default 3. */
  maxNgramSize?: number;
  /** Co-occurrence window size for the relatedness feature. Default 1. */
  windowSize?: number;
  /** Similarity ceiling above which a candidate is dropped as a near-duplicate. 1 disables dedup. Default 0.9. */
  dedupeThreshold?: number;
  /** Max number of keywords to return. Default 10. */
  limit?: number;
  /** Stopwords to use; defaults to bundled English. Pass your own set for other languages. */
  stopwords?: Iterable<string>;
}

interface ResolvedOptions {
  maxNgramSize: number;
  windowSize: number;
  dedupeThreshold: number;
  limit: number;
  stopwords: Set<string>;
}

const DEFAULT_MAX_NGRAM_SIZE = 3;
const DEFAULT_WINDOW_SIZE = 1;
const DEFAULT_DEDUPE_THRESHOLD = 0.9;
const DEFAULT_LIMIT = 10;

export function resolveOptions(options: YakeTsOptions = {}): ResolvedOptions {
  const maxNgramSize = options.maxNgramSize ?? DEFAULT_MAX_NGRAM_SIZE;
  const windowSize = options.windowSize ?? DEFAULT_WINDOW_SIZE;
  const dedupeThreshold = options.dedupeThreshold ?? DEFAULT_DEDUPE_THRESHOLD;
  const limit = options.limit ?? DEFAULT_LIMIT;

  for (const [name, value] of [
    ["maxNgramSize", maxNgramSize],
    ["windowSize", windowSize],
    ["limit", limit],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) {
      throw new TypeError(`${name} must be a positive integer, got ${value}.`);
    }
  }

  if (!Number.isFinite(dedupeThreshold) || dedupeThreshold < 0) {
    throw new TypeError(`dedupeThreshold must be a finite non-negative number, got ${dedupeThreshold}.`);
  }

  const stopwords = options.stopwords == null
    ? new Set(ENGLISH_STOPWORDS)
    : new Set([...options.stopwords].map((word) => word.toLowerCase()));

  return { maxNgramSize, windowSize, dedupeThreshold, limit, stopwords };
}
```

### 3. `src/extract.ts`

The public orchestration function — this is the whole point of the
package.

```ts
import { buildDocument, scoreAllCandidates, scoreSingleTerms } from "./internal/data-core.js";
import type { Candidate } from "./internal/composed-word.js";
import { levenshteinSimilarity } from "./similarity.js";
import { resolveOptions, type YakeTsOptions } from "./config.js";

export interface Keyword {
  /** Surface form as it appeared in the source text. */
  keyword: string;
  /** Lowercased form used for matching/deduplication. */
  normalized: string;
  /** YAKE score — lower is more relevant. */
  score: number;
  ngramSize: number;
  occurrences: number;
}

export function extractKeywords(text: string, options: YakeTsOptions = {}): Keyword[] {
  if (!text) {
    return [];
  }

  const resolved = resolveOptions(options);
  const document = buildDocument(text, resolved.stopwords, {
    windowSize: resolved.windowSize,
    maxNgramSize: resolved.maxNgramSize,
  });

  scoreSingleTerms(document);
  scoreAllCandidates(document);

  const candidates = [...document.candidates.values()]
    .filter((candidate) => isValidCandidate(candidate)) // import from composed-word.js
    .sort(compareCandidates);

  if (resolved.dedupeThreshold >= 1) {
    return candidates.slice(0, resolved.limit).map(toKeyword);
  }

  const kept: Candidate[] = [];
  for (const candidate of candidates) {
    const isDuplicate = kept.some(
      (existing) => levenshteinSimilarity(candidate.uniqueKw, existing.uniqueKw) > resolved.dedupeThreshold,
    );
    if (!isDuplicate) {
      kept.push(candidate);
    }
    if (kept.length === resolved.limit) {
      break;
    }
  }

  return kept.map(toKeyword);
}

function compareCandidates(a: Candidate, b: Candidate): number {
  const delta = a.h - b.h;
  if (Math.abs(delta) > 1e-15) {
    return delta;
  }
  return a.order - b.order; // stable tie-break by first-seen order
}

function toKeyword(candidate: Candidate): Keyword {
  return {
    keyword: candidate.kw,
    normalized: candidate.uniqueKw,
    score: candidate.h,
    ngramSize: candidate.size,
    occurrences: candidate.tf,
  };
}
```

(Remember to actually import `isValidCandidate` from `./internal/composed-word.js` at the top — left as a comment above instead of a real import line to keep this snippet copy-pasteable without a stale import block; fix that when transcribing.)

Note: `compareCandidates` here is intentionally simpler than yaket's
original (which has an extra "sliding n-gram tie" special case for rare
exact-score ties on overlapping 3+-word phrases — see
`research/yaket/src/KeywordExtractor.ts::isSlidingNgramTie`). Skipped
deliberately as another surface-area simplification; only worth
reinstating if real output shows visibly wrong tie-breaking on overlapping
phrases.

### 4. `src/index.ts`

```ts
export { extractKeywords, type Keyword } from "./extract.js";
export type { YakeTsOptions } from "./config.js";
export { ENGLISH_STOPWORDS } from "./stopwords-en.js";
export { levenshteinDistance, levenshteinSimilarity } from "./similarity.js";
```

That's the entire public surface. No classes exported. No CLI, no
highlighter, no document-pipeline helpers, no hooks — all deliberately cut
per "we only need ~20% of YAKET."

### 5. Root `package.json`

```json
{
  "name": "yake-ts",
  "version": "0.1.0",
  "description": "Tiny, dependency-free, English-only YAKE keyword extractor.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "engines": { "node": ">=18" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test test/"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  },
  "license": "MIT"
}
```

Zero runtime dependencies — that's a deliberate, load-bearing property of
this package, don't add any without a very good reason.

**Node version note**: this sandbox has Node v16.20.2 (`node --version`).
`node:test` (the built-in test runner referenced below) needs Node 18+. If
still on Node 16 when you pick this up, either: (a) check if Node was
upgraded, or (b) write the smoke test as a plain `.mjs` script using
`node:assert` and run it with plain `node test/smoke.mjs` instead of `node
--test` — same zero-dependency property, just not using the test-runner
framing. Prefer (a) if possible since `node --test` gives nicer output for
free.

### 6. Root `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

`NodeNext` resolution is why every relative import in the source files
above uses an explicit `.js` extension even though the files are `.ts` —
that's correct and required, not a typo (matches the convention already
used throughout the vendored/adapted files).

### 7. Smoke test — `test/extract.test.ts` (or `.mjs` per the Node-version note above)

Per earlier guidance in this session: skip building out yaket's whole
Python-parity/mutation-testing apparatus, but *do* leave one runnable check
since this is non-trivial logic (a full scoring pipeline, not a one-liner).
Use the well-known "Google is acquiring Kaggle" sample text (same one used
by both `research/yake-python/tests/test_yake.py` and
`research/yake-wasm/src/lib.rs`'s own test, and in yaket's Komoroske
benchmark) as a sanity fixture — full text is in
`docs/research-report.md` if it's still around, or `research/yake-wasm/src/lib.rs` lines ~510-533. Don't assert exact scores (we deliberately
diverge from upstream via the Levenshtein-only dedup and simplified
tie-break) — assert shape and sanity instead:

- Non-empty input with real content → returns a non-empty array, sorted by
  ascending `score`, length `<= limit`.
- Something recognizable near the top — e.g. `results.some(k =>
  k.normalized === "google")` or `"kaggle"`.
- `extractKeywords("")` → `[]`.
- `extractKeywords("the a an is are was were")` (all-stopword input) → `[]`.
- A short realistic "session naming" input (e.g. `"fix flaky auth test in
  login flow"`) → returns something sane and non-empty, since that's the
  actual target use case, not big news articles.
- `dedupeThreshold: 1` returns more/equal candidates than the default
  (dedup disabled).

### 8. Build, run, verify

```bash
cd /Users/me/code/yake-wasm
npm install --save-dev typescript
npm run build
node --test test/    # or: node test/extract.test.mjs, per Node-version note
```

Fix any TS errors that come up — they're likely to be minor (an
`exactOptionalPropertyTypes`-style nit, a missing `.js` extension somewhere,
or the `isValidCandidate` import left as a comment in the `extract.ts`
snippet above). The algorithm logic itself has been read carefully during
porting and should be correct; treat compiler/test failures as integration
bugs, not reasons to re-derive the algorithm.

### 9. Docs cleanup (do this last, only after everything above passes)

- `docs/research-report.md` is now stale — it was written *before* discovering
  `research/yaket`, and its main conclusion ("build from scratch") was
  superseded mid-conversation by "found yaket, vendor+trim instead of
  rebuilding." User explicitly said this file is no longer relevant and
  **can be removed** once the new package is done.
- Write a new, short root `README.md` for `yake-ts` covering: what it is,
  install, one usage example, the `YakeTsOptions` table (with the renamed
  params and their defaults, from `config.ts`), and a one-paragraph "design
  notes" section covering the deliberate simplifications (Levenshtein-only
  dedup, English-only, no classes, no cache) so a future reader isn't
  surprised by any of them. Keep it short — this is a tiny single-purpose
  package, not `yaket`'s doc empire.
- Once the new README exists and the package works, delete
  `docs/research-report.md` (or move its genuinely-still-useful parts —
  the algorithm formula table in §1, the bug list for `yake-wasm` in §2 —
  into a `docs/algorithm-notes.md` if it seems worth keeping for later
  reference; user's call, default to just deleting it if unsure).
- Check whether `research/` itself should be trimmed/removed once nothing
  in `src/` depends on it anymore — it's several hundred MB of prior-art
  checkouts (`yake-python`, `yake-wasm`, `yaket`, plus a red-herring
  `node_modules/yake`) that were only ever meant as research material. Ask
  the user before deleting it — it's a `git status` "untracked" concern,
  not committed, but confirm before removing something this size.

### 10. Commit

`.git` is now available in this repo (it wasn't at the start of the
research phase). Commit the working `src/`, `test/`, `package.json`,
`tsconfig.json`, and `README.md` together once the build+test step above
passes. Don't commit `research/` or `docs/research-report.md` if it's been
deleted per step 9. Follow the repo's normal commit conventions (see system
prompt git instructions — new commit, not amend, `Co-Authored-By` trailer).

## Key decisions (context for "why", not just "what")

- **Vendor-and-trim, not a live dependency on `research/yaket`.** The
  npm-published `@ade_oshineye/yaket` is stuck at `0.5.3` (checked via `npm
  view @ade_oshineye/yaket version` — network access confirmed working),
  which predates the 0.6 API cleanup (still has snake_case aliases, no
  `parseYakeOptions` guard). The vendored checkout in `research/yaket` is
  `0.6.1` but has no built `dist/` and no `node_modules` — building it
  would require installing its full heavy devDependency set (Stryker,
  Cloudflare Workers types, Wrangler, Vitest, etc.) just to compile a
  `tsc` output, which is a lot of toolchain weight for what's supposed to
  be a thin/minimal wrapper. Its `engines` field also says Node `>=20`,
  while this sandbox has Node v16.20.2 — checked whether that's a real
  runtime constraint (grepped for `toSorted`, `groupBy`, `structuredClone`,
  etc. — none found), so it's probably just a conservative CI floor, but
  combined with the stale-registry and no-dist issues, vendoring the ~900
  lines of genuinely dependency-free algorithm code was the more reliable
  choice than fighting either the registry gap or the local build.
- **Functional rewrite (no classes) was a deliberate, explicit user
  request**, argued as: everything runs once per `extractKeywords()` call,
  no object needs to be reused or subclassed, so a class only adds `this`-
  binding ceremony with no payoff. Converted `DirectedGraph`, `SingleWord`,
  `ComposedWord`, `DataCore` classes → plain interfaces + functions. Kept
  internal mutation (plain objects with mutable fields, updated via
  functions) rather than going fully immutable — the user's stated
  objection was to OOP ceremony specifically ("everything runs once, so no
  reusability needed"), not to mutation in general, and full immutability
  would be a much larger, riskier rewrite for no clear benefit at this
  input scale (short chat-sized text). The public API (`extractKeywords`)
  is a pure function regardless: same input → same output, nothing
  persists between calls.
- **English-only by default, `stopwords` escape hatch for other
  languages**, rather than bundling yaket's 34-language stopword module.
  Investigated whether yaket's own multi-language bundle could be
  "tree-shaken" per-language as its own docs suggest — traced the import
  graph and found `KeywordExtractor.ts` unconditionally imports
  `defaultStopwordProvider` from `strategies.ts` (as a runtime fallback:
  `options.stopwordProvider ?? defaultStopwordProvider`), which
  unconditionally imports the full `stopwords.generated.ts` (all 34
  languages, ~40KB gzipped, confirmed by yaket's own
  `docs/benchmarks/bundle-size.md`). Because that fallback reference is
  reachable code (not statically provably dead), no bundler can tree-shake
  it away even for a consumer who always supplies their own `stopwords`
  option. So yaket's own advice ("ship a single-language StopwordProvider
  and tree-shake the rest") doesn't actually work via its public API.
  Sidestepped entirely by not depending on that module at all — vendor
  just the English list, and let callers bring their own set for other
  languages. This is more reliable than trying to solve yaket's
  tree-shaking gap.
- **Single dedup algorithm (Levenshtein), not the pluggable
  `seqm`/`levs`/`jaro` choice** yaket offers. Matches "drop extra
  algorithms" from the user. Levenshtein chosen over upstream's default
  `seqm` because it's simpler (no cache, no heuristic tuning, ~20 lines)
  and good enough for the target use case (deduping short candidate
  phrases from short chat-sized text, not corpus-scale documents).
- **No runtime dependencies at all**, including on `research/yaket` — see
  first bullet. This was already the direction from earlier feedback ("no
  cache," "tiny," "single purpose tool") and became stronger once the
  live-dependency path turned out to be unreliable in this environment.

## What's intentionally NOT ported from yaket (don't add these back without a real ask)

CLI (`bin/yaket`), Bobbin adapter, document-pipeline helpers
(`extractFromDocument` etc.), `TextHighlighter`, the 11 pluggable hook
types (`TextProcessor`, `Tokenizer`, `SentenceSplitter`,
`CandidateNormalizer`, `Lemmatizer`, `SingleWordScorer`, `MultiWordScorer`,
`KeywordScorer`, `candidateFilter`, `StopwordProvider`,
`SimilarityStrategy`), multi-language stopword bundle, `seqm`/`jaro` dedup
metrics, feature-subset selection (`features` option), similarity caching,
Cloudflare Workers test lane, mutation testing, Python-parity test harness.
All of these exist in `research/yaket` if a real future need justifies
adding one back in — but the whole point of this package is that it
doesn't carry any of that weight.

## Quick sanity check on where things stand right now

```bash
ls src/ src/internal/          # 6 files should exist, all listed above
git status --short             # docs/ and src/ untracked, nothing else
```

If those match, start at step 1 above (`src/stopwords-en.ts`) and work
straight through to step 10.

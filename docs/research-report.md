# YAKE-TS Research Report

Research pass over the three reference libs in `research/` to figure out what to reuse, what to fix, and how to shape a new package: a tiny, fast, TS-first YAKE keyword extractor, good enough to run inline for things like naming a Claude Code session from its first message.

Scope note: this is research + recommendations only. Nothing in `research/` was modified. No new package was scaffolded — that's a follow-up decision once you've read this.

---

## 0. Correction: one of the three sources is not YAKE

`research/node_modules/yake` is **not** a keyword-extraction library. It's an unrelated build-task runner ("yet another implementation of jake — with a twist", [package.json](../research/node_modules/yake/package.json)). Its `src/yake.js` deals with task graphs (`tasks.js`, `invocation_list.js`), not text. Ignore this directory entirely — nothing in it is relevant.

The three real sources are:

| You called it | Actual path | What it is |
|---|---|---|
| `yake` (node) | *(doesn't exist in this checkout — see above)* | N/A, misidentified |
| `yake-warm` | [research/yake-wasm/](../research/yake-wasm/) | Unofficial Rust→WASM port, by Kyle Fahey (`quesurifn/yake-wasm`) |
| `yake-python` | [research/yake-python/](../research/yake-python/) | Official Python impl (INESCTEC), heavily modernized fork — v0.7.1, not the classic 0.4.x |

Worth knowing: this copy of `yake-python` is **not** the vanilla upstream algorithm — it's been reworked with similarity caching, adaptive dedup strategies, lemmatization, and modernized docs (see `_optimized_small_dedup` / `_medium_dedup` / `_large_dedup` in [core/yake.py](../research/yake-python/yake/core/yake.py)). The *scoring formulas* are the same as classic YAKE (verified against the paper's feature set: WCase, WPos, WFreq, WRel, WSpread), but the surrounding engine is a rewrite with production concerns (caching, batching heuristics) that mostly don't apply to a "score one short string once" use case. Treat this as the correctness reference, not an architecture template.

---

## 1. The algorithm, as ground truth

Both `yake-python` and `yake-wasm` implement the same published algorithm; `yake-python` is more complete and is what the test fixtures below were generated from, so treat it as canonical when the two disagree.

**Pipeline:** text → sentences → words → single-term features → co-occurrence graph → n-gram candidates → composed-term scoring → filter invalid candidates → sort ascending by score (lower = better) → dedupe by string similarity → top N.

### Per-term features ([single_word.py:239-308](../research/yake-python/yake/data/single_word.py#L239-L308))

| Symbol | Name | Formula | Meaning |
|---|---|---|---|
| `WCase` | casing | `max(tf_upper, tf_properNoun) / (1 + ln(tf))` | rewards acronyms/proper nouns |
| `WPos` | position | `ln(ln(3 + median(sentence_positions)))` | rewards words that show up early |
| `WFreq` | frequency | `tf / (mean_tf + stddev_tf)` | normalized term frequency |
| `WRel` | relatedness | `(0.5 + pwl·tf/max_tf) + (0.5 + pwr·tf/max_tf)` | how much this term "connects" to different neighbors (pwl/pwr = distinct-neighbor-count / edge-weight-sum, from the co-occurrence digraph) |
| `WSpread` | spread | `sentences_containing_term / total_sentences` | dispersion across the doc |
| `H` (final) | — | `(WPos · WRel) / (WCase + WFreq/WRel + WSpread/WRel)` | **lower is better** |

### Multi-word candidates ([composed_word.py:314-397](../research/yake-python/yake/data/composed_word.py#L314-L397))

Score = `product(term.H for non-stopwords) / ((sum(term.H) + 1) · tf)`, where stopwords inside a phrase are handled by "BiWeight": their contribution is derived from the co-occurrence probability with their left/right neighbor, not their own H (`STOPWORD_WEIGHT = "bi"` in [utils.py:22](../research/yake-python/yake/data/utils.py#L22)). A candidate is invalid (dropped) if it starts or ends with a stopword, or if any of its tokens tagged as digit/"unusual" ([composed_word.py:157-173](../research/yake-python/yake/data/composed_word.py#L157-L173)).

### Word tagging ([utils.py:94-147](../research/yake-python/yake/data/utils.py#L94-L147))

Five tags drive filtering: `d` (digit), `u` (unusual — mixed alnum or has punctuation), `a` (acronym, ALL CAPS), `n` (proper noun, capitalized and not sentence-initial), `p` (plain). `u`/`d` tokens can never be part of a valid candidate.

### Deduplication

Greedy: sort candidates by score ascending, walk the list, keep a candidate only if its string similarity to every already-kept candidate is `<= dedupLim`. Similarity metric is pluggable — Jaro, SequenceMatcher-ratio ("seqm"), or normalized Levenshtein ("levs") ([core/yake.py:154-350](../research/yake-python/yake/core/yake.py#L154-L350)). Classic YAKE default is `dedup_lim=0.9`, `dedup_func="seqm"`.

### Config knobs that exist today (and what they're actually called)

From [core/yake.py:36-49](../research/yake-python/yake/core/yake.py#L36-L49):

| Cryptic name | What it controls | Better name |
|---|---|---|
| `lan` | stopword language | `language` / just accept a `stopwords: Set<string>` |
| `n` | max n-gram size | `maxNgramSize` |
| `dedup_lim` | similarity ceiling for dedup | `dedupeThreshold` |
| `dedup_func` | which similarity metric | `dedupeMetric: 'jaro' \| 'levenshtein' \| 'sequenceMatcher'` |
| `window_size` | co-occurrence window | `windowSize` (this one's already fine) |
| `top` | result count | `limit` |
| `pwl` / `pwr` / `wdl` / `wdr` / `wil` / `wir` | graph metrics | internal only — never surface these |

This confirms your instinct: `n`, `lan`, `pwl` etc. are exactly the kind of unexplained-abbreviation params worth renaming in the new API.

---

## 2. What to take from `yake-wasm` (the Rust/WASM port)

Actually a fairly faithful, compact single-file port — [research/yake-wasm/src/lib.rs](../research/yake-wasm/src/lib.rs) (594 lines) implements the whole pipeline: `build_text` → `ngram_selection` → `candidate_filtering` → `candidate_selection` → `vocabulary_building` → `context_building` → `feature_extraction` → `candidate_weighting` → dedupe. It's a good **reading reference for translating the algorithm into a systems language** (Rust reads much closer to a hypothetical TS port than Python's OOP/networkx version does), and the pipeline shape (explicit, named stages, each a pure-ish function) is worth mirroring in the new package's internal structure even if you don't reuse a line of code.

Concretely reusable:
- The pipeline decomposition itself (`lib.rs:146-178`, `get_n_best`) — same 9 stages as Python, good scaffold for a composable TS API (each stage → one exported function).
- Punctuation set and default n-gram/dedup constants ([lib.rs:129-144](../research/yake-wasm/src/lib.rs#L129-L144)): `ngram=3`, `dedup_lim=0.8` (note: differs from Python's `0.9`), `window_size=2`.
- Embedded English stopword list ([stopwords.rs](../research/yake-wasm/src/stopwords.rs)) — same corpus as Python's `stopwords_en.txt`, already deduped into a Rust literal, easy to turn into a `.ts` const or JSON.
- Test fixture: the "Google/Kaggle" article + expected top-10 output ([lib.rs:508-592](../research/yake-wasm/src/lib.rs#L508-L592)) — same text used in the Python test suite (§4), good cross-check.

### Bugs / rough edges confirmed while reading (why you were right not to trust it as-is)

1. **`preprocessor.rs` is dead-code theater.** `Preprocessor::new` takes `expand_contractions: Option<bool>` and stores it on the struct ([preprocessor.rs:6-18](../research/yake-wasm/src/preprocessor.rs#L6-L18)), but the field is **never read** — `split_into_words` just does `.replace("'s", "")` unconditionally and ignores the flag entirely ([preprocessor.rs:20-28](../research/yake-wasm/src/preprocessor.rs#L20-L28)). Contractions like "don't", "it's", "we're" are not actually expanded — the Cargo dep `contractions = "0.5.4"` ([Cargo.toml:16](../research/yake-wasm/Cargo.toml#L16)) is pulled in and never called anywhere in `lib.rs` or `preprocessor.rs`. Confirms your "unfinished code" read.
2. **Likely panic / underflow in stopword-context scoring.** [lib.rs:374](../research/yake-wasm/src/lib.rs#L374): `if j - 1 > 0` — `j` is `usize`; when `j == 0` this underflows before the comparison even runs. In a release WASM build this wraps to a huge number rather than panicking outright, silently producing garbage context lookups for the first token of any candidate; in a debug build it aborts. Either way it's wrong — Python's equivalent guards with `t > 0` before subtracting ([composed_word.py:355](../research/yake-python/yake/data/composed_word.py#L355)).
3. **Off-by-one vs. Python in the same spot**: even ignoring the underflow, `j - 1 > 0` only lets `j >= 2` through; Python's `t > 0` lets `t >= 1` through. So the Rust version also skips scoring the left-context probability for the second token (`j == 1`) where Python includes it. This is a real, silent divergence from the reference algorithm, not just a crash risk.
4. **No multi-language stopwords** — English only. Python ships 34 language files (§3).
5. **API surface is thin but the shape is fine**: `new(ngram?, remove_duplicates?)` + `get_n_best(text, n?)`. Good precedent for "no upfront config, just call the function with a few named options."
6. **`console.log`-only debugging, no structured errors.** `Result<JsValue, JsValue>` return type but nothing meaningful ever lands in the `Err` branch — extraction can't currently fail in a way callers can distinguish from "no keywords found."
7. **Docs/examples are a single wall-of-text example** ([examples/index.js](../research/yake-wasm/examples/index.js), [README.md](../research/yake-wasm/README.md)) — confirms "no clear docs or examples."
8. `wee_alloc` as global allocator ([lib.rs:33-34](../research/yake-wasm/src/lib.rs#L33-L34)) — this crate is unmaintained and known to have memory-safety issues; if you do go the WASM route, don't carry this forward, use the default allocator or `dlmalloc`.

None of these are hard to fix, but they explain why you correctly didn't want to just `npm install` this and move on.

---

## 3. What to take from `yake-python`

This is the deepest and most correct source. Treat it as the spec.

- **Scoring formulas** — [single_word.py:239-308](../research/yake-python/yake/data/single_word.py#L239-L308) and [composed_word.py:314-397](../research/yake-python/yake/data/composed_word.py#L314-L397) — already tabulated above. Port these formulas verbatim; they're the actual product.
- **Word tagging rules** — [utils.py:94-147](../research/yake-python/yake/data/utils.py#L94-L147) (digit / unusual / acronym / proper-noun / plain). Small, pure, easy to port as one function.
- **`pre_filter` normalization** — [utils.py:25-62](../research/yake-python/yake/data/utils.py#L25-L62): paragraph-aware newline handling (keeps `\n\n` before capitalized lines, collapses other newlines to spaces). Worth porting; it's the kind of subtle text-shape detail that changes sentence segmentation quality.
- **Stopword corpus** — [yake/core/StopwordsList/](../research/yake-python/yake/core/StopwordsList/): 34 language files, ~10.7k lines total, English alone is a few hundred entries. If you want multi-language support this is the ready-made corpus (same MIT-compatible research license as the rest of the project — double check the LICENSE file before vendoring, but it's the standard academic-stopword-list situation). For a session-title-naming use case, honestly **just English is probably enough**, see §6.
- **Test suite / fixtures** — [tests/test_yake.py](../research/yake-python/tests/test_yake.py) and [tests/test_features.py](../research/yake-python/tests/test_features.py), see §4 below — this is your dataset for "does our TS port match the real algorithm."
- **What *not* to port**: `_similarity_cache`, `_ultra_fast_similarity`, `_aggressive_pre_filter`, the small/medium/large adaptive dedup strategy selection ([core/yake.py:224-350](../research/yake-python/yake/core/yake.py#L224-L350), [677-788](../research/yake-python/yake/core/yake.py#L677-L788)), `_manage_cache_lifecycle` — this is all batch-throughput engineering for "extracting keywords from thousands of documents in a service," irrelevant and actively against your "no cache" requirement. Skip lemmatization too ([core/yake.py:352-548](../research/yake-python/yake/core/yake.py#L352-L548)) — it needs spaCy/NLTK, a non-starter for a tiny JS lib, and isn't something classic YAKE does either (this fork added it).
- **`highlight.py`** ([core/highlight.py](../research/yake-python/yake/core/highlight.py)) is a working feature (wrap matched keywords in `<kw>…</kw>` in the source text) but the implementation is a genuinely tangled state machine (10+ mutually-recursive helper methods passing dict "context" blobs around). If highlighting is in scope at all, re-derive the *behavior* from the tests rather than porting this code — it's exactly the kind of code you said you wanted to avoid writing.

---

## 4. Test suite: mimic these, don't re-derive scores by hand

`yake-python`'s test suite is unusually good for this purpose — it asserts exact float scores, which means you can lift them directly as TS fixtures rather than trying to hand-verify a port.

From [tests/test_yake.py](../research/yake-python/tests/test_yake.py) (1733 lines total, first ~1226 read):

- `test_n3_EN` / `test_n1_EN` / `test_n4_EN` — the canonical "Google is acquiring Kaggle" article at n=3, n=1, n=4, with exact expected `(keyword, score)` tuples. **This is the same article used in `yake-wasm`'s own test** ([lib.rs:508-592](../research/yake-wasm/src/lib.rs#L508-L592)), so it's a three-way cross-check.
- `test_n3_PT`, `test_n1_EL`, `test_n3_KO`, `test_multilingual_support` (DE, FR) — multi-language, exact scores. Useful if you keep multi-language stopwords; skippable if you go English-only.
- `test_deduplication_functions` / `test_no_deduplication` — exact scores for `dedupLim=0.9` vs `1.0` on `"machine learning machine learning deep learning"`.
- `test_custom_stopwords`, `test_window_size_parameter` — param-level unit tests with exact expected output, good template for TS `describe` blocks per-parameter.
- `test_composed_word_with_digits`, `test_composed_word_stopword_boundaries`, `test_composed_word_with_acronyms` — small, targeted, exact-score tests for individual filtering rules (§1's `is_valid`).
- `test_phraseless_example`, `test_null_and_blank_example`, `test_empty_after_stopword_removal` — edge cases (empty string, null, all-stopword input → `[]`). **Must-have** for a session-naming use case, since real input will sometimes be tiny or degenerate ("ok", "fix bug", a single emoji).
- `test_composed_word_update_h_with_consecutive_stopwords`, `test_composed_word_n5_with_stopwords` — regression tests for a specific historical bug (negative scores from consecutive-stopword phrases, referenced as "Issue #17 fix") — good reminder to explicitly test consecutive-stopword input, since that's exactly where `yake-wasm`'s bug #2/#3 above lives too.

[tests/test_features.py](../research/yake-python/tests/test_features.py) (519 lines) unit-tests the feature functions in isolation with mocked term objects rather than full-pipeline text — good pattern for testing your ported `WCase`/`WPos`/etc. formulas directly instead of only end-to-end.

**Recommendation**: port the exact-score tests as golden fixtures (same input text, same expected `[keyword, score][]`), and treat any deviation as a bug to explain, not something to shrug off as "different rounding." Floating point should match to ~1e-9 since the arithmetic is simple (no unstable numerics involved).

---

## 5. Architecture recommendation for the new package

### Core: pure TS, not WASM, not WebGPU

For the stated use case (naming a Claude Code session — a few hundred tokens, extracted once, latency matters, called from a CLI/Node process that starts cold every time):

- **WASM is a bad default here.** The whole pipeline is scalar arithmetic over small dictionaries/arrays (`HashMap<String,_>` lookups, a handful of `f64` ops per token) — nothing SIMD-shaped, nothing that benefits from Rust's numeric performance the way, say, a tokenizer regex engine or a matrix op would. Meanwhile every WASM module pays fixed cold-start cost (fetch/read the `.wasm`, compile, instantiate, allocate linear memory) before doing any useful work. For "extract keywords from one 500-token message, once," that fixed cost is very likely to dominate over the JS-vs-native compute delta. `yake-wasm` itself never benchmarks this — the README's `console.time` wraps construction *and* extraction together with no JS baseline to compare against.
- **WebGPU is the wrong tool entirely.** WebGPU earns its keep on data-parallel numeric workloads (thousands+ independent elements, ideally matmul-shaped). YAKE's candidate scoring is a sequential-ish pass over a co-occurrence graph with maybe a few hundred candidates for a short text — nowhere near the parallelism or arithmetic intensity where GPU dispatch overhead pays for itself. Mentioning it as "not a bad idea" in the brief, but after reading the algorithm: skip it. Revisit only if the actual future use case becomes "score thousands of documents in a batch job," which is a different product.
- **Pure TS gets you**: instant cold start, zero native build step (no `wasm-pack`, no target triples, no `.wasm` asset to ship/host), trivial to read/debug/step through, works identically in Node/Deno/Bun/browser without a bundler plugin. Given the algorithm is dictionaries + arrays + a handful of float formulas, V8 will JIT this fine — this is not compute-bound work.

**Recommendation**: build the whole thing as plain modern TS. Skip WASM and WebGPU as *default* backends. If someone later has a genuine batch-throughput need (scoring thousands of docs in a server job), that's a distinct, optional `@your-scope/yake-native` package behind the same function signatures — not a reason to complicate the core today. Fixing `yake-wasm`'s bugs is worthwhile only if that future need materializes; don't do it speculatively.

### Composable API shape

Mirror the pipeline stages from `yake-wasm`'s `lib.rs` (§2) as independently-exported pure functions, not a class:

```ts
// each stage is independently usable/testable
export function tokenizeSentences(text: string): Sentence[]
export function buildCandidates(sentences: Sentence[], opts: { maxNgramSize: number }): Candidate[]
export function scoreTerms(sentences: Sentence[], opts: { stopwords: Set<string> }): TermScores
export function scoreCandidates(candidates: Candidate[], termScores: TermScores): ScoredCandidate[]
export function dedupe(candidates: ScoredCandidate[], opts: { threshold: number; metric: DedupeMetric }): ScoredCandidate[]

// the convenience one-shot, built from the above
export function extractKeywords(text: string, opts?: ExtractOptions): ScoredKeyword[]
```

This satisfies "composable, users can use functions where they want them" directly, and it maps cleanly onto the existing Rust pipeline stages so translation is mechanical rather than a redesign.

### Params — proposed renames

| Old (Python/Rust) | New | Default | Notes |
|---|---|---|---|
| `n` | `maxNgramSize` | `3` | |
| `dedup_lim` / `dedup_lim` | `dedupeThreshold` | `0.9` (Python's value; `yake-wasm` used `0.8`, worth a deliberate choice not an accident) | |
| `dedup_func` | `dedupeMetric` | `'sequenceMatcher'` | union type, not a string enum |
| `window_size` | `windowSize` | `1` (Python default) or `2` (`yake-wasm`'s) — pick one deliberately | |
| `top` | `limit` | `10` | |
| `lan` + internal stopword file lookup | `stopwords?: Iterable<string>` | English built-in | no "language code" indirection — caller passes a set directly, package ships one default English set |
| `remove_duplicates` (bool, Rust) | folds into `dedupeThreshold` (Python's `>=1.0` already means "no dedup" — reuse that, don't add a separate boolean) | | |

### No upfront config / no cache — already the natural shape

Since there's no class/instance in the plan above, "no upfront config" falls out for free — every call is `extractKeywords(text, options)` with sane defaults, no `new Extractor(...)` step, no `clear_caches()` lifecycle to manage (which Python needs precisely *because* it caches — you're explicitly opting out of that whole problem category).

### Stopwords packaging

If you keep multi-language support, ship each language as a separate subpath export (`yake-ts/stopwords/pt`, `/es`, …) sourced from `research/yake-python/yake/core/StopwordsList/*.txt`, so bundlers tree-shake unused languages instead of forcing every consumer to carry ~10k lines of stopword data for languages they'll never pass. English ships as the default, inlined.

### Highlighting

If you want the `<kw>…</kw>` text-highlight feature from Python's `TextHighlighter`, re-implement it from the test-asserted behavior in `test_yake.py` (the `textHighlighted ==` assertions) rather than porting [highlight.py](../research/yake-python/yake/core/highlight.py) — the existing implementation is genuinely more complex than the behavior it produces warrants.

---

## 6. Open questions for you to decide (not derivable from the code)

- **Multi-language stopwords**: worth the bundle-size/complexity for a "name my coding session" use case, or is English-only fine to start (with the door left open via `stopwords?: Iterable<string>`)? Leaning English-only given the stated use case.
- **`windowSize` default**: Python uses `1`, `yake-wasm` uses `2` — these will produce different scores for the same input. Pick one and pin it in the golden tests rather than inheriting whichever by accident.
- **`dedupeThreshold` default**: same divergence (`0.9` vs `0.8`) — same call to make.
- **Levenshtein/similarity impl**: Python offers Jaro/SequenceMatcher/Levenshtein; `yake-wasm` only does a Levenshtein ratio ([levenshtein.rs](../research/yake-wasm/src/levenshtein.rs)). A plain JS Levenshtein-ratio implementation is ~15 lines, no dependency needed — don't reach for an npm string-similarity package for this.
- **Highlighting**: in scope for v1, or purely score-ranked keywords for now?
- **ESM only vs. dual CJS/ESM**: given "modern ES, no classes," ESM-only with `"type": "module"` is probably the right lazy default — dual-build tooling is exactly the kind of upfront config/build complexity this project is trying to avoid. Worth confirming Node/Claude-Code-session tooling doesn't force CJS on you.

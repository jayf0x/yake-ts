# Changelog

All notable changes to `yake-ts`. Dates are release dates; versions follow
[semver](https://semver.org/).

## 1.2.1 — 2026-08-18

- Internal and tooling changes only.

## 1.2.0 — 2026-08-18

- Initial release of yake-ts: dependency-free YAKE keyword extractor with `extractKeywords()` pure function
- Support for 33 languages via tree-shakeable subpath exports (English bundled by default)
- Refactored to functional style (no classes, one pure function per module)
- Build tooling: Vite library build, Biome formatter, bun:test runner

## 0.1.0 — 2026-08-18

- Initial release: `extractKeywords`, a dependency-free YAKE keyword extractor.
- English stopwords bundled by default; 33 more languages available as opt-in, tree-shakeable
  subpath imports (`yake-ts/stopwords/<code>`).
- `Keyword` results include `sentenceIds` — which sentences each phrase occurred in.

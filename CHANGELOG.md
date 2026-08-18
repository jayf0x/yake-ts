# Changelog

All notable changes to `yake-ts`. Dates are release dates; versions follow
[semver](https://semver.org/).

## 0.1.0 — 2026-08-18

- Initial release: `extractKeywords`, a dependency-free YAKE keyword extractor.
- English stopwords bundled by default; 33 more languages available as opt-in, tree-shakeable
  subpath imports (`yake-ts/stopwords/<code>`).
- `Keyword` results include `sentenceIds` — which sentences each phrase occurred in.

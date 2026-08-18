---
name: Bug
about: Something broken in yake-ts
title: 'bug: <short description>'
labels: 'type:bug'
assignees: ''
---

## What's broken

<!-- One sentence. What fails? -->

## Domain

<!-- tick one -->

- [ ] `domain:tokenize` — sentence/word splitting, tagging (`src/internal/tokenize.ts`)
- [ ] `domain:graph` — co-occurrence graph (`src/internal/graph.ts`)
- [ ] `domain:scoring` — single-word / candidate scoring (`src/internal/single-word.ts`, `src/internal/composed-word.ts`)
- [ ] `domain:extract` — public `extractKeywords` pipeline (`src/extract.ts`)
- [ ] `domain:config` — option resolution (`src/config.ts`)

## Reproduce

```ts
extractKeywords("...", { /* options */ });
```

## Expected vs actual

|          |     |
| -------- | --- |
| Expected |     |
| Actual   |     |

## Context

- Version:
- Node/Bun version:

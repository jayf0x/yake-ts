#!/usr/bin/env bun
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
/**
 * Keeps README.md's numbers and tables real instead of hand-typed and stale. Regenerates, via
 * taglify blocks:
 *
 * - `OPTIONS-TABLE` / `KEYWORD-TABLE` — from the `YakeTsOptions`/`Keyword` interfaces' own JSDoc,
 *   via `type-to-table`'s `typeGet` (plain-type mode — no React, no rendering component needed;
 *   that's the `type-to-table/react` subpath, which doesn't apply to these).
 * - `LANG-CODES` — from the files in src/stopwords/.
 * - `BUNDLE-SIZE` — gzip size of the built dist/index.js (run `bun run build` first).
 * - `KEYWORD-EXAMPLE` / `QUICKSTART-EXAMPLE` — real `extractKeywords()` calls, not typed-out output.
 *
 * Usage: `bun scripts/docs/sync-readme.ts` (also runs as part of `bun run npm:deploy`).
 */
import { gzipSync } from "node:zlib";
import { taglText } from "taglify";
import { typeGet } from "type-to-table";
import { extractKeywords } from "../../src/index.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const README = resolve(ROOT, "README.md");

// ── API tables, from the interfaces' own JSDoc ─────────────────────────────────
const optionsTable = typeGet(resolve(ROOT, "src/config.ts"), "YakeTsOptions");
const keywordTable = typeGet(resolve(ROOT, "src/extract.ts"), "Keyword");

// ── Available language codes, from src/stopwords/ itself ───────────────────────
const stopwordsDir = resolve(ROOT, "src/stopwords");
const codes = readdirSync(stopwordsDir)
  .filter((f) => f.endsWith(".ts") && f !== "en.ts")
  .map((f) => f.replace(/\.ts$/, ""))
  .sort();
const langCodes = `${codes.map((c) => `\`${c}\``).join(", ")} (vendored from \`@ade_oshineye/yaket\`'s stopword bundle)`;

// ── Bundle size, from the actual built file ─────────────────────────────────────
const distIndex = resolve(ROOT, "dist/index.js");
let bundleSize = "unknown — run `bun run build` first";
try {
  const gzipped = gzipSync(await Bun.file(distIndex).arrayBuffer());
  bundleSize = `${(gzipped.byteLength / 1024).toFixed(1)} kB`;
} catch {
  console.warn(`! ${distIndex} missing — BUNDLE-SIZE left stale, run "bun run build" first`);
}

// ── Real example output, not typed-out ──────────────────────────────────────────
const oneLiner = extractKeywords("fix flaky auth test in login flow")[0].keyword;
const keywordExample = [
  "```ts",
  'import { extractKeywords } from "yake-ts";',
  "",
  `extractKeywords("fix flaky auth test in login flow")[0].keyword;`,
  `// ${JSON.stringify(oneLiner)}`,
  "```",
].join("\n");

const quickstart = extractKeywords("fix flaky auth test in login flow");
const formatKeyword = (k: (typeof quickstart)[number], indent: string) =>
  `${indent}{ keyword: ${JSON.stringify(k.keyword)}, normalized: ${JSON.stringify(k.normalized)}, score: ${k.score.toFixed(3)},\n${indent}  ngramSize: ${k.ngramSize}, occurrences: ${k.occurrences}, sentenceIds: ${JSON.stringify(k.sentenceIds)} },`;
const quickstartExample = [
  "```ts",
  'import { extractKeywords } from "yake-ts";',
  "",
  'const keywords = extractKeywords("fix flaky auth test in login flow");',
  "// [",
  formatKeyword(quickstart[0], "//   "),
  "//   ...",
  "// ]",
  "```",
].join("\n");

// ── Write ─────────────────────────────────────────────────────────────────────
const readme = await Bun.file(README).text();
const result = taglText(readme, {
  "OPTIONS-TABLE": optionsTable,
  "KEYWORD-TABLE": keywordTable,
  "LANG-CODES": langCodes,
  "BUNDLE-SIZE": bundleSize,
  "KEYWORD-EXAMPLE": keywordExample,
  "QUICKSTART-EXAMPLE": quickstartExample,
});
result.write(README);

console.log(result.changed ? "✓ README.md synced with real code/build output" : "✓ README.md already up to date");

/**
 * Japanese stopwords. Vendored from yaket's stopwords.generated.ts ("ja" entry).
 *
 * CAVEAT: yake-ts's tokenizer splits on whitespace/word-boundary runs, not
 * CJK word segmentation — it has no way to find word boundaries inside
 * unspaced Japanese text, so extraction on raw Japanese input will not
 * produce useful candidates. Only useful if you pre-segment the text
 * yourself (e.g. space-join the words) before calling extractKeywords.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "これ",
  "それ",
  "あれ",
  "この",
  "その",
  "あの",
  "ここ",
  "そこ",
  "あそこ",
  "こちら",
  "どこ",
  "だれ",
  "なに",
  "なん",
  "何",
  "私",
  "貴方",
  "貴方方",
  "我々",
  "私達",
  "あの人",
  "あのかた",
  "彼女",
  "彼",
  "です",
  "あります",
  "おります",
  "います",
  "は",
  "が",
  "の",
  "に",
  "を",
  "で",
  "え",
  "から",
  "まで",
  "より",
  "も",
  "どの",
  "と",
  "し",
  "それで",
  "しかし",
]);

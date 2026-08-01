/**
 * Copyright (c) 2026 hangtiancheng
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Text helpers for the search index: CJK-aware tokenizing and hit-centered
 * display snippets. Pure functions — shared by the search view and tests.
 */

const CJK_CHAR = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/**
 * CJK-aware tokenizer (used for both indexing and querying). MiniSearch's
 * default splitter treats a whole CJK sentence as one token, so Chinese
 * text was only matchable by sentence-prefix. Word runs containing CJK are
 * additionally split into single characters (plus the run itself).
 */
export function cjkTokenize(text: string): string[] {
  const runs = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens: string[] = [];
  for (const run of runs) {
    tokens.push(run);
    if (CJK_CHAR.test(run)) {
      for (const ch of run) tokens.push(ch);
    }
  }
  return tokens;
}

/**
 * Cut a display snippet from section text, centered on the earliest
 * occurrence of any query term; falls back to the text head. Ellipses mark
 * truncated edges. Pair with the highlighter for term marking.
 */
export function makeSnippet(text: string, query: string, span = 90): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  let hitIdx = -1;
  for (const t of terms) {
    const idx = lower.indexOf(t);
    if (idx >= 0 && (hitIdx < 0 || idx < hitIdx)) hitIdx = idx;
  }

  const start = hitIdx < 0 ? 0 : Math.max(0, hitIdx - 20);
  const end = Math.min(text.length, start + span);
  return (
    (start > 0 ? "…" : "") +
    text.slice(start, end) +
    (end < text.length ? "…" : "")
  );
}

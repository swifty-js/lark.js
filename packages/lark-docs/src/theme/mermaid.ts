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
 * Client-side mermaid rendering for `.mermaid-block[data-mermaid]`
 * placeholders emitted by the fence renderer (code-blocks.ts).
 *
 * Design constraints:
 * - mermaid is heavy, so it is dynamically imported on the first page that
 *   actually contains a diagram (memoized promise, same idiom as the Shiki
 *   loader in markdown/highlighter.ts).
 * - The lark-mvc string diff reverts ALL runtime DOM mutations inside the
 *   article on every digest (drawer toggle, navigation, hot update), so
 *   rendering must be replayed idempotently after each digest — rendered
 *   SVGs are cached per code+theme, making replays cheap.
 * - The diagram theme follows the site dark mode (`.dark` on <html>); the
 *   data-mermaid-rendered marker records which theme a block was rendered
 *   with, so a theme toggle naturally triggers a re-render.
 */
import { escapeHtml } from "../utils/escape-html";

type MermaidApi = typeof import("mermaid").default;

let mermaidPromise: Promise<MermaidApi> | null = null;

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => m.default);
  }
  return mermaidPromise;
}

// Rendered SVG cache: `${theme}\u0000${code}` -> svg markup. Bounded only by
// the diagrams actually viewed in a session; digest replays hit this cache.
const svgCache = new Map<string, string>();

let renderSeq = 0;
// Serializes render batches — mermaid.initialize is global state, so two
// interleaved batches with different themes must not overlap.
let queue: Promise<void> = Promise.resolve();

function currentTheme(): "dark" | "default" {
  return document.documentElement.classList.contains("dark")
    ? "dark"
    : "default";
}

/**
 * Render all mermaid placeholders under `#docs-content` for the current
 * theme. Idempotent and safe to call after every digest; no-op (and no
 * mermaid download) when the page has no diagrams.
 */
export function renderMermaidBlocks(): void {
  const blocks = document.querySelectorAll<HTMLElement>(
    "#docs-content .mermaid-block[data-mermaid]",
  );
  if (blocks.length === 0) return;

  const theme = currentTheme();
  const pending = Array.from(blocks).filter(
    (b) => b.getAttribute("data-mermaid-rendered") !== theme,
  );
  if (pending.length === 0) return;

  queue = queue.then(() => renderBatch(pending));
}

async function renderBatch(blocks: HTMLElement[]): Promise<void> {
  // Re-read the theme inside the serialized batch — a toggle may have
  // happened while a previous batch was running.
  const theme = currentTheme();
  let mermaid: MermaidApi;
  try {
    mermaid = await loadMermaid();
  } catch (err) {
    console.warn("[@lark.js/docs] failed to load mermaid", err);
    return;
  }

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    suppressErrorRendering: true,
    theme,
  });

  for (const block of blocks) {
    // The block may have been detached (navigation) or re-rendered by a
    // newer batch while awaiting — skip stale work.
    if (!block.isConnected) continue;
    if (block.getAttribute("data-mermaid-rendered") === theme) continue;

    const encoded = block.getAttribute("data-mermaid") ?? "";
    let code: string;
    try {
      code = decodeURIComponent(encoded);
    } catch {
      continue;
    }

    const cacheKey = `${theme}\u0000${code}`;
    let svg = svgCache.get(cacheKey);
    if (svg === undefined) {
      try {
        const result = await mermaid.render(
          `lark-mermaid-${renderSeq++}`,
          code,
        );
        svg = result.svg;
        svgCache.set(cacheKey, svg);
      } catch (err) {
        block.innerHTML = `<pre class="mermaid-error">${escapeHtml(
          err instanceof Error ? err.message : String(err),
        )}\n\n${escapeHtml(code)}</pre>`;
        block.setAttribute("data-mermaid-rendered", theme);
        continue;
      }
    }

    block.innerHTML = svg;
    block.setAttribute("data-mermaid-rendered", theme);
  }
}

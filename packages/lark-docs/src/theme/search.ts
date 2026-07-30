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
 * SearchView - command palette full-text search (local provider).
 *
 * MiniSearch-powered (same engine as VitePress) with keyboard navigation,
 * IME-safe Enter handling, race-safe async results, and segment highlighting.
 * Open/close state is driven by State.searchOpen.
 */
import MiniSearch, { type SearchResult } from "minisearch";
import { State, Router, defineView, useEffect } from "@lark.js/mvc";
import type { VDomTemplate, ViewSetup, ViewTemplate } from "@lark.js/mvc";
import { z } from "zod";
import { icons } from "./icons";
import type { SearchEntry } from "../types";

const SearchEntrySchema = z.object({
  title: z.string(),
  link: z.string(),
  headings: z.array(z.string()),
  excerpt: z.string(),
});
type RuntimeSearchEntry = z.infer<typeof SearchEntrySchema>;

type GetSearchIndexFn = () => Promise<RuntimeSearchEntry[]>;
const GetSearchIndexSchema = z.custom<GetSearchIndexFn>(
  (v) => typeof v === "function",
);

const MAX_RESULTS = 12;

export function createSearchView(
  template: ViewTemplate | VDomTemplate,
): ViewSetup {
  return defineView((ctx) => {
    let mini: MiniSearch | null = null;
    let seq = 0;

    ctx.updater.set({
      icons,
      results: [],
      hasSearched: false,
      query: "",
      activeIndex: 0,
      isOpen: false,
    });
    ctx.observeState("searchOpen");

    const assign = (): boolean | undefined => {
      ctx.updater.snapshot();
      const isOpen = !!State.get("searchOpen");
      ctx.updater.set({ isOpen });
      return ctx.updater.altered();
    };

    assign();

    ctx.renderMethod = () => {
      const wasOpen = !!ctx.updater.get("isOpen");
      assign();
      ctx.updater.digest();
      const isOpen = !!ctx.updater.get("isOpen");

      if (isOpen && !wasOpen) {
        requestAnimationFrame(() => {
          document.getElementById("docs-search-input")?.focus();
        });
      }
      if (!isOpen && wasOpen) {
        // Reset state on close.
        ctx.updater
          .set({ results: [], hasSearched: false, query: "", activeIndex: 0 })
          .digest();
        const input = document.getElementById("docs-search-input");
        if (input instanceof HTMLInputElement) input.value = "";
      }
    };

    // Escape closes regardless of focus position.
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape" && State.get("searchOpen")) {
          State.set({ searchOpen: false }).digest();
        }
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    });

    async function ensureMiniSearch(): Promise<MiniSearch | null> {
      if (mini) return mini;
      const fnParse = GetSearchIndexSchema.safeParse(
        State.get("getSearchIndex"),
      );
      if (!fnParse.success) {
        console.warn(
          "[@lark.js/docs] getSearchIndex not injected — search is unavailable.",
        );
        return null;
      }
      const rawIndex = await fnParse.data();
      const indexParse = z.array(SearchEntrySchema).safeParse(rawIndex);
      if (!indexParse.success) {
        console.warn(
          "[@lark.js/docs] search index failed validation — search is unavailable.",
        );
        return null;
      }
      const index = indexParse.data;
      if (index.length === 0) return null;

      const docs = index.map((entry, i) => ({ ...entry, id: i }));
      mini = new MiniSearch({
        fields: ["title", "headings", "excerpt"],
        storeFields: ["title", "link", "headings", "excerpt"],
        searchOptions: {
          prefix: true,
          fuzzy: 0.2,
          boost: { title: 2, headings: 1.5 },
        },
      });
      mini.addAll(docs);
      return mini;
    }

    function navigateToActive(): void {
      const results = ctx.updater.get("results") as
        Array<{ link: string }> | undefined;
      const idx = (ctx.updater.get("activeIndex") as number) ?? 0;
      const target = results?.[idx];
      if (target?.link) {
        Router.to(target.link);
        State.set({ searchOpen: false }).digest();
      }
    }

    function scrollActiveIntoView(): void {
      requestAnimationFrame(() => {
        const dialog = document.getElementById("docs-search-dialog");
        const links = dialog?.querySelectorAll<HTMLElement>("a[data-index]");
        const idx = (ctx.updater.get("activeIndex") as number) ?? 0;
        links?.[idx]?.scrollIntoView({ block: "nearest" });
      });
    }

    return {
      template,
      assign,
      events: {
        "onOverlayClick<click>": (e: Event & { eventTarget?: EventTarget }) => {
          if (
            e.eventTarget instanceof HTMLElement &&
            e.eventTarget.id === "docs-search-overlay"
          ) {
            State.set({ searchOpen: false }).digest();
          }
        },
        "noop<click>": () => {},
        "onDialogKey<keydown>": (e: KeyboardEvent) => {
          if (e.isComposing) return;
          const len = ((ctx.updater.get("results") as unknown[]) ?? []).length;
          if (len === 0) return;
          const idx = (ctx.updater.get("activeIndex") as number) ?? 0;

          if (e.key === "ArrowDown") {
            e.preventDefault();
            ctx.updater.set({ activeIndex: (idx + 1) % len }).digest();
            scrollActiveIntoView();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            ctx.updater.set({ activeIndex: (idx - 1 + len) % len }).digest();
            scrollActiveIntoView();
          } else if (e.key === "Enter") {
            e.preventDefault();
            navigateToActive();
          }
        },
        "onResultHover<mouseover>": (
          e: Event & { eventTarget?: EventTarget },
        ) => {
          let el = e.eventTarget instanceof HTMLElement ? e.eventTarget : null;
          while (el && el.dataset["index"] === undefined) el = el.parentElement;
          const indexStr = el?.dataset["index"];
          if (indexStr !== undefined) {
            const idx = parseInt(indexStr, 10);
            if (idx !== ctx.updater.get("activeIndex")) {
              ctx.updater.set({ activeIndex: idx }).digest();
            }
          }
        },
        "onSearchInput<input>": async (e: Event) => {
          const input = e.target instanceof HTMLInputElement ? e.target : null;
          const query = input?.value ?? "";
          const mySeq = ++seq;

          if (!query.trim()) {
            ctx.updater
              .set({
                results: [],
                hasSearched: false,
                query: "",
                activeIndex: 0,
              })
              .digest();
            return;
          }

          const m = await ensureMiniSearch();
          if (mySeq !== seq) return; // stale — a newer query superseded us

          let raw: (SearchResult & Partial<SearchEntry>)[] = [];
          if (m) {
            try {
              raw = m.search(query).slice(0, MAX_RESULTS);
            } catch {
              raw = [];
            }
          }
          if (mySeq !== seq) return;

          const results = raw.map((r) => ({
            title: r.title || "",
            link: r.link || "",
            excerpt: r.excerpt || "",
            highlightedTitle: highlightSegments(r.title || "", query),
            highlightedExcerpt: highlightSegments(r.excerpt || "", query),
          }));

          ctx.updater
            .set({ results, hasSearched: true, query, activeIndex: 0 })
            .digest();
        },
        "clearQuery<click>": () => {
          seq++;
          const input = document.getElementById("docs-search-input");
          if (input instanceof HTMLInputElement) {
            input.value = "";
            input.focus();
          }
          ctx.updater
            .set({ results: [], hasSearched: false, query: "", activeIndex: 0 })
            .digest();
        },
        "goToResult<click>": (e: Event) => {
          let el = e.target instanceof HTMLElement ? e.target : null;
          while (el && !el.dataset["href"]) el = el.parentElement;
          const href = el ? (el.dataset["href"] ?? null) : null;
          if (href) {
            Router.to(href);
            State.set({ searchOpen: false }).digest();
          }
        },
      },
    };
  });
}

/**
 * Split text by query term matches, escape all segments, and wrap matches
 * in <mark>. Safe for raw {{!}} template output (all text is escaped).
 */
function highlightSegments(text: string, query: string): string {
  if (!text) return "";
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return escapeHtml(text);
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return text
    .split(pattern)
    .map((part, i) =>
      i % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part),
    )
    .join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

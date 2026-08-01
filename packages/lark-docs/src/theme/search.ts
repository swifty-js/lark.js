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
import { escapeHtml } from "../utils/escape-html";
import { OnContentUpdateSchema } from "./hot-update";
import {
  buildSectionDocs,
  type SectionSearchDoc,
} from "../utils/search-sections";
import { cjkTokenize, makeSnippet } from "../utils/search-text";

const SearchEntrySchema = z.object({
  title: z.string(),
  link: z.string(),
  headings: z.array(z.string()),
  excerpt: z.string(),
  contentHtml: z.string(),
});
type RuntimeSearchEntry = z.infer<typeof SearchEntrySchema>;

/** Cap per page so one title-heavy page cannot flood the result list. */
const MAX_RESULTS_PER_PAGE = 3;

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
      indexSize: 0,
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

    let pendingBuild: Promise<MiniSearch | null> | null = null;
    // Bumped when md content hot-updates; an in-flight build from an older
    // generation must not install its (stale) MiniSearch instance.
    let indexGeneration = 0;

    // Dev-only md hot reload: drop the cached MiniSearch so the next search
    // rebuilds from the refreshed getSearchIndex().
    useEffect(() => {
      const sub = OnContentUpdateSchema.safeParse(State.get("onContentUpdate"));
      if (!sub.success) return;
      return sub.data(() => {
        indexGeneration++;
        mini = null;
        pendingBuild = null;
      });
    });

    function ensureMiniSearch(): Promise<MiniSearch | null> {
      if (mini) return Promise.resolve(mini);
      if (pendingBuild) return pendingBuild;
      pendingBuild = buildMiniSearch().finally(() => {
        pendingBuild = null;
      });
      return pendingBuild;
    }

    async function buildMiniSearch(): Promise<MiniSearch | null> {
      const gen = indexGeneration;
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
      if (gen !== indexGeneration) return null;
      const indexParse = z.array(SearchEntrySchema).safeParse(rawIndex);
      if (!indexParse.success) {
        console.warn(
          "[@lark.js/docs] search index failed validation — search is unavailable.",
        );
        return null;
      }
      const index = indexParse.data;
      if (index.length === 0) return null;

      // Section-level granularity: split each page's compiled HTML at
      // h1–h3 boundaries so results deep-link to /path#slug, with a
      // hierarchical breadcrumb from the section's h1/h2 ancestry.
      const docs = buildSectionDocs(index);
      if (docs.length === 0) return null;

      mini = new MiniSearch({
        fields: ["title", "pageTitle", "text"],
        storeFields: ["title", "pageTitle", "crumb", "link", "text"],
        tokenize: cjkTokenize,
        searchOptions: {
          prefix: true,
          fuzzy: 0.2,
          boost: { title: 2, pageTitle: 1.5 },
        },
      });
      mini.addAll(docs);
      ctx.updater.set({ indexSize: docs.length }).digest();
      return mini;
    }

    // Router.to strips "#hash" (and no-ops on the current path), so deep
    // links handle the hash themselves — same pattern as the layout's
    // in-content anchor clicks and the Toc.
    function navigateToResult(link: string): void {
      const hashIdx = link.indexOf("#");
      const path = (hashIdx >= 0 ? link.slice(0, hashIdx) : link) || "/";
      const slug = hashIdx >= 0 ? link.slice(hashIdx + 1) : "";
      const currentPath =
        (Router.parse().path || "/").replace(/\/+$/, "") || "/";

      State.set({ searchOpen: false }).digest();

      if (path === currentPath) {
        if (!slug) {
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        if (window.location.hash !== `#${slug}`) {
          history.pushState(null, "", `#${slug}`);
        }
        document
          .getElementById(slug)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      Router.to(path);
      if (slug) {
        // The layout's post-render enhancement reads window.location.hash
        // fresh and scrolls to it — the hash just has to be on the URL.
        history.replaceState(null, "", `${path}#${slug}`);
      }
    }

    function navigateToActive(): void {
      const results = ctx.updater.get("results") as
        Array<{ link: string }> | undefined;
      const idx = (ctx.updater.get("activeIndex") as number) ?? 0;
      const target = results?.[idx];
      if (target?.link) {
        navigateToResult(target.link);
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
          // The click lands on the backdrop or the centering wrapper, never
          // on the overlay element itself — close on anything outside the
          // dialog box.
          if (
            e.eventTarget instanceof HTMLElement &&
            !e.eventTarget.closest("#docs-search-dialog")
          ) {
            State.set({ searchOpen: false }).digest();
          }
        },
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

          let raw: (SearchResult & Partial<SectionSearchDoc>)[] = [];
          if (m) {
            try {
              const all = m.search(query) as (SearchResult &
                Partial<SectionSearchDoc>)[];
              // Per-page cap, then the global cap.
              const perPage = new Map<string, number>();
              raw = [];
              for (const r of all) {
                const page = (r.link || "").split("#")[0];
                const n = perPage.get(page) ?? 0;
                if (n >= MAX_RESULTS_PER_PAGE) continue;
                perPage.set(page, n + 1);
                raw.push(r);
                if (raw.length >= MAX_RESULTS) break;
              }
            } catch {
              raw = [];
            }
          }
          if (mySeq !== seq) return;

          const results = raw.map((r) => {
            const excerpt = makeSnippet(r.text || "", query);
            return {
              title: r.title || "",
              link: r.link || "",
              excerpt,
              // Hierarchical context ("Page › H2"), already deduped
              // against the section's own title.
              pageTitle: r.crumb || "",
              highlightedTitle: highlightSegments(r.title || "", query),
              highlightedExcerpt: highlightSegments(excerpt, query),
            };
          });

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
            navigateToResult(href);
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

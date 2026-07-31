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

import { State, defineView, useResource } from "@lark.js/mvc";
import type { VDomTemplate, ViewSetup, ViewTemplate } from "@lark.js/mvc";
import { z } from "zod";
import { icons } from "./icons";

const TocHeadingSchema = z.looseObject({
  level: z.number(),
  slug: z.string(),
  text: z.string(),
});
const TocHeadingsSchema = z.array(TocHeadingSchema);
type TocHeading = z.infer<typeof TocHeadingSchema>;

function decodedLocationHash(): string {
  try {
    return decodeURIComponent(window.location.hash);
  } catch {
    return window.location.hash;
  }
}

/**
 * TocView - heading outline with scroll-spy and animated marker.
 *
 * Renders h2/h3 headings for the current page. Supports two placements:
 * right rail (default) and inline ([[toc]] directive, params.inline).
 */
export function createTocView(
  template: ViewTemplate | VDomTemplate,
): ViewSetup {
  return defineView((ctx, params?: unknown) => {
    const inline =
      !!params &&
      typeof params === "object" &&
      "inline" in params &&
      params.inline === "true";

    ctx.updater.set({
      icons,
      inline,
      headings: [],
      markerTop: 0,
      markerHeight: 0,
      markerShow: false,
    });

    ctx.observeState("currentPageHeadings");

    let activeSlug = "";
    let raf = 0;
    let ro: ResizeObserver | null = null;

    const readHeadings = (): TocHeading[] => {
      const r = TocHeadingsSchema.safeParse(State.get("currentPageHeadings"));
      return r.success ? r.data : [];
    };

    const buildHeadings = () =>
      readHeadings().map((h) => ({
        level: h.level,
        slug: h.slug,
        text: h.text,
        isActive: h.slug === activeSlug,
      }));

    const assign = (): boolean | undefined => {
      ctx.updater.snapshot();
      ctx.updater.set({ headings: buildHeadings() });
      return ctx.updater.altered();
    };

    assign();

    /** Position the animated marker beside the active link. */
    const syncMarker = (): void => {
      const root = document.getElementById(ctx.owner.id);
      const link = activeSlug
        ? root?.querySelector<HTMLElement>(
            `a[data-slug="${CSS.escape(activeSlug)}"]`,
          )
        : null;
      const li = link?.parentElement;
      if (li) {
        ctx.updater
          .set({
            markerTop: li.offsetTop,
            markerHeight: li.offsetHeight,
            markerShow: true,
          })
          .digest();
      } else {
        ctx.updater.set({ markerShow: false }).digest();
      }
    };

    /**
     * Scroll-spy: the last heading whose top sits at or above the 96px
     * line (navbar + breathing room) is active; at the very bottom of
     * the page the last heading wins, since trailing sections may be
     * too short to ever reach that line. Recomputes on scroll/resize
     * (rAF-throttled) instead of IntersectionObserver: IO only fires
     * when a heading crosses its rootMargin band edges, which rarely
     * coincides with the 96px line — the highlight went stale between
     * crossings.
     */
    const compute = (): void => {
      raf = 0;
      const headings = readHeadings();
      if (headings.length === 0) return;
      const doc = document.documentElement;
      const atBottom =
        window.innerHeight + window.scrollY >= doc.scrollHeight - 1;
      let current = "";
      if (atBottom) {
        for (let i = headings.length - 1; i >= 0; i--) {
          const h = headings[i];
          if (h && document.getElementById(h.slug)) {
            current = h.slug;
            break;
          }
        }
      } else {
        for (const h of headings) {
          const el = document.getElementById(h.slug);
          // +1 tolerates subpixel rounding after smooth scrollIntoView.
          if (el && el.getBoundingClientRect().top <= 97) {
            current = h.slug;
          }
        }
      }
      if (current === activeSlug) return;
      activeSlug = current;
      ctx.updater.set({ headings: buildHeadings() });
      ctx.updater.digest();
      setTimeout(syncMarker, 0);
    };

    const schedule = (): void => {
      if (!raf) raf = requestAnimationFrame(compute);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Late layout shifts (images, fonts) move the headings without a
    // scroll event — watch the document size too.
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(schedule);
      ro.observe(document.documentElement);
    }

    useResource("tocScrollSpy", {
      destroy: () => {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", schedule);
        ro?.disconnect();
        ro = null;
      },
    });

    ctx.renderMethod = () => {
      assign();
      ctx.updater.digest();
      schedule();
      setTimeout(syncMarker, 0);
    };

    return {
      template,
      assign,
      events: {
        "scrollToHeading<click>": (e: Event) => {
          e.preventDefault();
          let el = e.target instanceof HTMLElement ? e.target : null;
          while (el && !el.dataset["slug"]) el = el.parentElement;
          const slug = el ? (el.dataset["slug"] ?? null) : null;
          if (!slug) return;
          const target = document.getElementById(slug);
          if (!target) return;
          if (decodedLocationHash() !== `#${slug}`) {
            history.pushState(null, "", `#${slug}`);
          }
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        },
      },
    };
  });
}

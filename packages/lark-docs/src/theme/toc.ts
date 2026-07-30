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
    let observer: IntersectionObserver | null = null;

    // Disconnect the scroll-spy observer when the view is destroyed.
    useResource("tocScrollSpy", {
      destroy: () => {
        observer?.disconnect();
        observer = null;
      },
    });

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

    const observeHeadings = (): void => {
      if (typeof IntersectionObserver === "undefined") return;
      if (observer) observer.disconnect();
      const headings = readHeadings();
      if (headings.length === 0) return;

      observer = new IntersectionObserver(
        () => {
          let current = "";
          for (const h of headings) {
            const el = document.getElementById(h.slug);
            if (!el) continue;
            if (el.getBoundingClientRect().top <= 96) {
              current = h.slug;
            }
          }
          if (current === activeSlug) return;
          activeSlug = current;
          ctx.updater.set({ headings: buildHeadings() });
          ctx.updater.digest();
          setTimeout(syncMarker, 0);
        },
        { rootMargin: "0px 0px -70% 0px", threshold: 0 },
      );

      setTimeout(() => {
        if (!observer) return;
        for (const h of headings) {
          const el = document.getElementById(h.slug);
          if (el) observer.observe(el);
        }
      }, 0);
    };

    ctx.renderMethod = () => {
      assign();
      ctx.updater.digest();
      observeHeadings();
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

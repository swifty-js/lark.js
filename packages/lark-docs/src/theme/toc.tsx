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

import {
  State,
  defineView,
  jsxTemplate,
  raw,
  signal,
  batch,
  useResource,
  useSignalEffect,
} from "@lark.js/mvc";
import type { LarkView, LarkEvent } from "@lark.js/mvc";
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
 * right rail (default) and inline — the `[[toc]]` markdown directive mounts
 * the `theme/toc-inline` registered variant created with
 * `createTocView({ inline: true })` (raw registered-path HTML carries no
 * props, so the flag is baked into the factory).
 *
 * Reactivity: the template reads `State.get("currentPageHeadings")` (tracked
 * — the layout's navigation writes it) plus the local `activeSlug` / marker
 * signals written by the rAF scroll-spy.
 */
export function createTocView(options?: { inline?: boolean }): LarkView {
  const inline = options?.inline === true;
  return defineView((ctx) => {
    const activeSlug = signal("");
    const markerTop = signal(0);
    const markerHeight = signal(0);
    const markerShow = signal(false);

    let raf = 0;
    let ro: ResizeObserver | null = null;

    const readHeadings = (): TocHeading[] => {
      const r = TocHeadingsSchema.safeParse(State.get("currentPageHeadings"));
      return r.success ? r.data : [];
    };

    /** Position the animated marker beside the active link. */
    const syncMarker = (): void => {
      const root = document.getElementById(ctx.owner.id);
      const slug = activeSlug.peek();
      const link = slug
        ? root?.querySelector<HTMLElement>(`a[data-slug="${CSS.escape(slug)}"]`)
        : null;
      const li = link?.parentElement;
      batch(() => {
        if (li) {
          markerTop.value = li.offsetTop;
          markerHeight.value = li.offsetHeight;
          markerShow.value = true;
        } else {
          markerShow.value = false;
        }
      });
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
      if (current === activeSlug.peek()) return;
      activeSlug.value = current; // template re-renders reactively
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

    // Page navigation replaces the headings — re-run the spy and marker.
    useSignalEffect(() => {
      State.get("currentPageHeadings"); // subscribe to page changes
      schedule();
      setTimeout(syncMarker, 0);
    });

    const scrollToHeading = (e: LarkEvent): void => {
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
    };

    const template = jsxTemplate(() => {
      const active = activeSlug.value;
      const headings = readHeadings().map((h) => ({
        level: h.level,
        slug: h.slug,
        text: h.text,
        isActive: h.slug === active,
      }));
      return (
        <div>
          {headings.length > 0 && (
            <div
              class={
                inline
                  ? "not-prose border-muted/80 bg-muted/30 my-6 rounded-xl border p-4"
                  : ""
              }
            >
              <p class="text-muted-foreground flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">
                <span class="size-3.5 [&>svg]:size-full">
                  {raw(icons.list)}
                </span>
                On this page
              </p>
              <div class="relative mt-3">
                <span
                  aria-hidden="true"
                  class="bg-muted/80 absolute inset-y-0 left-0 w-px"
                ></span>
                <span
                  aria-hidden="true"
                  class={[
                    "bg-primary absolute left-0 w-px rounded-full transition-[top,height,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                    !markerShow.value && "opacity-0",
                  ]}
                  style={`top: ${markerTop.value}px; height: ${markerHeight.value}px`}
                ></span>
                <ul class="space-y-px pl-3">
                  {headings.map((heading) => (
                    <li class="relative">
                      <a
                        href={`#${heading.slug}`}
                        data-slug={heading.slug}
                        onClick={scrollToHeading}
                        class={[
                          "block py-1 text-xs leading-snug transition-colors duration-200",
                          heading.level >= 3 && "pl-3",
                          heading.isActive
                            ? "text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground",
                        ]}
                      >
                        {heading.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      );
    });

    return { template };
  });
}

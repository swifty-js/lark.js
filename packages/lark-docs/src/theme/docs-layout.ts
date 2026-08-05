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

import { State, Router, defineView, useEffect } from "@lark.js/mvc";
import type { VDomTemplate, ViewSetup, ViewTemplate } from "@lark.js/mvc";
import { z } from "zod";
import { icons as defaultIcons, clockIcons } from "./icons";
import { findDataHref } from "../utils/dom";
import { OnContentUpdateSchema } from "./hot-update";
import { renderMermaidBlocks } from "./mermaid";

interface NavLink {
  link: string;
  text: string;
}

// ============================================================
// Runtime Zod schemas for State-injected values.
// ============================================================

const NavItemSchema = z.object({
  text: z.string(),
  link: z.string(),
});

interface RuntimeSidebarItem {
  text: string;
  link?: string;
  collapsed?: boolean;
  items?: RuntimeSidebarItem[];
}

const SidebarItemSchema: z.ZodType<RuntimeSidebarItem> = z.object({
  text: z.string(),
  link: z.string().optional(),
  collapsed: z.boolean().optional(),
  items: z.lazy(() => z.array(SidebarItemSchema)).optional(),
});

const SidebarConfigSchema = z.union([
  z.literal("auto"),
  z.array(SidebarItemSchema),
]);

const DocsConfigSchema = z.object({
  docs: z.string().optional(),
  baseUrl: z.string(),
  title: z.string(),
  nav: z.array(NavItemSchema).optional(),
  sidebar: z.record(z.string(), SidebarConfigSchema).optional(),
  search: z.boolean().optional(),
});
type RuntimeDocsConfig = z.infer<typeof DocsConfigSchema>;
type RuntimeSidebarMap = NonNullable<RuntimeDocsConfig["sidebar"]>;

const PageHeadingSchema = z.looseObject({
  level: z.number(),
  text: z.string(),
  slug: z.string(),
});
const LoadedContentSchema = z.object({
  pageData: z.looseObject({
    title: z.string(),
    headings: z.array(PageHeadingSchema),
  }),
  contentHtml: z.string(),
});
type LoadedContent = z.infer<typeof LoadedContentSchema>;

type LoadContentFn = (path: string) => Promise<LoadedContent | null>;
const LoadContentSchema = z.custom<LoadContentFn>(
  (v) => typeof v === "function",
);

const FALLBACK_CONFIG: RuntimeDocsConfig = {
  title: "Documentation",
  baseUrl: "/",
};

function parseDocsConfig(v: unknown): RuntimeDocsConfig | null {
  const r = DocsConfigSchema.safeParse(v);
  return r.success ? r.data : null;
}

function parseLoadContent(v: unknown): LoadContentFn | null {
  const r = LoadContentSchema.safeParse(v);
  return r.success ? r.data : null;
}

function collectLinks(items: RuntimeSidebarItem[], out: NavLink[]): void {
  for (const item of items) {
    if (item.link) out.push({ link: item.link, text: item.text });
    if (item.items) collectLinks(item.items, out);
  }
}

/** Strip trailing slashes; "/" stays "/". */
function stripTrailingSlash(p: string): string {
  return p.replace(/\/+$/, "") || "/";
}

/**
 * Landing target for the logo, the 404 button and the root redirect:
 * the first internal nav link, falling back to baseUrl.
 */
function landingLink(cfg: RuntimeDocsConfig | null): string {
  const first = (cfg?.nav ?? []).find(
    (item) => !/^https?:\/\//.test(item.link),
  );
  return first?.link ?? cfg?.baseUrl ?? "/";
}

/** window.location.hash, decoded (location.hash is percent-encoded for CJK). */
function decodedLocationHash(): string {
  try {
    return decodeURIComponent(window.location.hash);
  } catch {
    return window.location.hash;
  }
}

function computePrevMvc(
  sidebar: RuntimeSidebarMap | undefined,
  currentPath: string,
): { prevPage: NavLink | null; nextPage: NavLink | null } {
  const flat: NavLink[] = [];
  if (sidebar) {
    for (const items of Object.values(sidebar)) {
      if (Array.isArray(items)) collectLinks(items, flat);
    }
  }
  // Trailing slashes are ignored on both sides, mirroring the active-state
  // matching in the sidebar view.
  const target = stripTrailingSlash(currentPath);
  const idx = flat.findIndex(
    (item) => stripTrailingSlash(item.link) === target,
  );
  if (idx < 0) return { prevPage: null, nextPage: null };
  const prevPage = idx > 0 ? flat[idx - 1] : null;
  const nextPage = idx < flat.length - 1 ? flat[idx + 1] : null;
  return { prevPage, nextPage };
}

const NAVBAR_SCROLLED_ADD = [
  "border-muted/80",
  "bg-background/80",
  "shadow-[0_1px_12px_-6px_rgb(0_0_0/0.08)]",
  "backdrop-blur-xl",
];
const NAVBAR_SCROLLED_REMOVE = ["border-transparent", "bg-transparent"];

function syncNavbar(scrolled: boolean): void {
  const header = document.getElementById("docs-navbar");
  if (!header) return;
  for (const c of NAVBAR_SCROLLED_ADD) header.classList.toggle(c, scrolled);
  for (const c of NAVBAR_SCROLLED_REMOVE) header.classList.toggle(c, !scrolled);
}

/** Mount copy buttons into .codeblock elements that lack one. */
function mountCopyButtons(copyIcon: string, checkIcon: string): void {
  const blocks = document.querySelectorAll<HTMLElement>(
    "#docs-content .codeblock",
  );
  for (const block of blocks) {
    if (block.querySelector(".codeblock-actions")) continue;
    const actions = document.createElement("div");
    actions.className = "codeblock-actions";
    const btn = document.createElement("button");
    btn.className = "codeblock-copy";
    btn.setAttribute("aria-label", "Copy code");
    btn.innerHTML = `<span class="size-3.5 [&>svg]:size-full">${copyIcon}</span>`;
    btn.addEventListener("click", () => {
      const code = block.querySelector("code");
      if (!code) return;
      navigator.clipboard
        .writeText(code.textContent ?? "")
        .then(() => {
          btn.classList.add("codeblock-copy-done");
          btn.innerHTML = `<span class="size-3.5 [&>svg]:size-full">${checkIcon}</span>`;
          setTimeout(() => {
            btn.classList.remove("codeblock-copy-done");
            btn.innerHTML = `<span class="size-3.5 [&>svg]:size-full">${copyIcon}</span>`;
          }, 1600);
        })
        .catch(() => {
          // clipboard unavailable
        });
    });
    actions.appendChild(btn);
    block.appendChild(actions);
  }
}

/** Re-trigger the page-in animation on the content article. */
function replayPageIn(): void {
  const article = document.getElementById("docs-content");
  if (!article) return;
  article.classList.remove("animate-page-in");
  void article.offsetWidth;
  article.classList.add("animate-page-in");
}

export function createDocsLayoutView(
  template: ViewTemplate | VDomTemplate,
): ViewSetup {
  return defineView((ctx) => {
    const clockIcon = clockIcons[new Date().getHours() % 12] ?? clockIcons[0];
    ctx.updater.set({
      icons: defaultIcons,
      clockIcon,
      year: new Date().getFullYear(),
      loading: true,
      notFound: false,
      drawerOpen: false,
      contentHtml: "",
      currentPath: "",
      prevPage: null,
      nextPage: null,
      navItems: [],
      siteTitle: "Documentation",
      searchEnabled: true,
    });

    ctx.observeLocation([], true);
    ctx.observeState("drawerOpen");

    let lastPath = "";
    let drawerSideEffectsActive = false;
    let drawerReturnFocus: HTMLElement | null = null;

    // Dev-only md hot reload. The generated module is the HMR accept
    // boundary and notifies subscribers with the changed route paths; we
    // re-fetch through the State-injected loadContent (guard-wrapped in the
    // consumer boot, so protected pages decrypt with the cached password).
    // Patch the updater directly instead of re-entering renderMethod: the
    // cheap path (path === lastPath) never touches contentHtml, and a forced
    // full render would replay the skeleton and the scroll-to-top logic.
    function applyHotContent(path: string, content: LoadedContent): void {
      if (path !== lastPath) return;
      const cfg = parseDocsConfig(State.get("docsConfig")) ?? FALLBACK_CONFIG;
      State.set({
        currentPageHeadings: content.pageData.headings,
        currentPageTitle: content.pageData.title,
      }).digest();
      document.title = `${content.pageData.title} · ${cfg.title}`;
      ctx.updater.set({ contentHtml: content.contentHtml });
      ctx.updater.digest();
      // Same post-render enhancements as a full navigation, minus the
      // page-in animation replay and the scroll-to-top/hash logic.
      setTimeout(() => {
        if (path !== lastPath) return;
        mountCopyButtons(defaultIcons.copy, defaultIcons.check);
        renderMermaidBlocks();
      }, 0);
    }

    useEffect(() => {
      const sub = OnContentUpdateSchema.safeParse(State.get("onContentUpdate"));
      if (!sub.success) return;
      return sub.data((routes) => {
        if (!routes.includes(lastPath)) return;
        const path = lastPath;
        const loadContent = parseLoadContent(State.get("loadContent"));
        if (!loadContent) return;
        loadContent(path)
          .then((result) => {
            const parsed = LoadedContentSchema.safeParse(result);
            if (parsed.success) applyHotContent(path, parsed.data);
          })
          .catch(() => {
            // Keep the current content on a failed hot fetch.
          });
      });
    });

    // Re-render mermaid diagrams when the site theme flips (.dark on <html>
    // is the only theme signal — same observation pattern as theme-toggle).
    useEffect(() => {
      const observer = new MutationObserver(() => renderMermaidBlocks());
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      return () => observer.disconnect();
    });

    // Navbar scroll-aware styling — direct classList toggle (cheap path,
    // bypasses the updater to avoid full template re-eval on every scroll).
    useEffect(() => {
      const onScroll = () => syncNavbar(window.scrollY > 8);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    });

    // Global keyboard shortcuts: ⌘K / Ctrl+K toggles search, "/" opens.
    // Only registered when search is enabled (config is injected into
    // State before boot, so it is readable at setup time).
    const setupSearchEnabled =
      (parseDocsConfig(State.get("docsConfig")) ?? FALLBACK_CONFIG).search ??
      true;
    if (setupSearchEnabled) {
      useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            State.set({ searchOpen: !State.get("searchOpen") }).digest();
            return;
          }
          if (e.key === "/" && !isTypingTarget(e.target)) {
            e.preventDefault();
            State.set({ searchOpen: true }).digest();
          }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      });
    }

    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }

    // `inert` removes the closed drawer from the tab order — it is only
    // translated off-screen, so without it keyboard focus could enter an
    // aria-hidden subtree. Applied imperatively after each digest because
    // the DOM diff strips attributes that are not in the template output.
    function syncDrawerInert(open: boolean): void {
      document.getElementById("docs-drawer")?.toggleAttribute("inert", !open);
    }

    function syncDrawerSideEffects(open: boolean): void {
      if (open === drawerSideEffectsActive) return;
      drawerSideEffectsActive = open;

      if (open) {
        document.body.style.overflow = "hidden";
        drawerReturnFocus =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        queueMicrotask(() => {
          document
            .getElementById("docs-drawer-panel")
            ?.querySelector<HTMLElement>("a, button")
            ?.focus();
        });
      } else {
        document.body.style.overflow = "";
        drawerReturnFocus?.focus();
        drawerReturnFocus = null;
      }
    }

    // Drawer Escape / Tab-trap keydown (document-level while open).
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (!State.get("drawerOpen")) return;
        if (e.key === "Escape") {
          State.set({ drawerOpen: false }).digest();
          return;
        }
        if (e.key !== "Tab") return;
        const panel = document.getElementById("docs-drawer-panel");
        const focusable = panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        const inside = active instanceof HTMLElement && panel?.contains(active);
        if (e.shiftKey && (active === first || !inside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !inside)) {
          e.preventDefault();
          first.focus();
        }
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    });

    ctx.renderMethod = async () => {
      const cfg = parseDocsConfig(State.get("docsConfig")) ?? FALLBACK_CONFIG;
      const loadContent = parseLoadContent(State.get("loadContent"));
      const rawPath = Router.parse().path || cfg.baseUrl || "/";

      const indexMatch = rawPath.match(/^(.*?)(\/index(?:\.md|\.html)?)\/?$/);
      if (indexMatch) {
        const cleanPath = indexMatch[1] || "/";
        Router.to(cleanPath, {}, true);
        return;
      }

      const path = rawPath.replace(/\/+$/, "") || "/";
      const drawerOpen = !!State.get("drawerOpen");

      // Cheap path: same page, only drawer/state toggled.
      if (path === lastPath) {
        ctx.updater.set({ drawerOpen });
        ctx.updater.digest();
        syncDrawerInert(drawerOpen);
        syncDrawerSideEffects(drawerOpen);
        // The digest re-renders the whole template, and the DOM diff
        // reverts runtime-injected enhancements (copy buttons, mermaid
        // SVGs) wherever the article subtree diverges — replay them.
        setTimeout(() => {
          if (path !== lastPath) return;
          mountCopyButtons(defaultIcons.copy, defaultIcons.check);
          renderMermaidBlocks();
        }, 0);
        return;
      }

      // Close drawer on navigation.
      if (drawerOpen) {
        State.set({ drawerOpen: false }).digest();
      }

      // Show skeleton while loading.
      ctx.updater.set({ loading: true, drawerOpen: false });
      ctx.updater.digest();
      syncDrawerInert(false);
      // The cheap path is skipped on full navigation, so the scroll lock
      // applied while the drawer was open must be released here too.
      syncDrawerSideEffects(false);

      const sig = ctx.signature.value;
      let content: LoadedContent | null = null;
      try {
        if (loadContent) {
          const result = await loadContent(path);
          const parsed = LoadedContentSchema.safeParse(result);
          content = parsed.success ? parsed.data : null;
        }
      } catch (err) {
        console.warn("[@lark.js/docs] Failed to load content for", path, err);
      }
      if (ctx.signature.value !== sig) return;

      // Root redirect: "/" or the bare baseUrl has no content of its own —
      // land on the first internal nav link instead of a 404.
      if (!content) {
        const base = stripTrailingSlash(cfg.baseUrl ?? "/");
        if (path === "/" || path === base) {
          const landing = landingLink(cfg);
          if (stripTrailingSlash(landing) !== path) {
            Router.to(landing, {}, true);
            return;
          }
        }
      }

      lastPath = path;

      if (content) {
        State.set({
          currentPageHeadings: content.pageData.headings,
          currentPageTitle: content.pageData.title,
        }).digest();
        document.title = `${content.pageData.title} · ${cfg.title}`;
      } else {
        document.title = cfg.title;
      }

      const { prevPage, nextPage } = computePrevMvc(cfg.sidebar, path);

      // Nav items with active state (prefix match). External links render
      // as real anchors with target="_blank" in the template.
      const navItems = (cfg.nav ?? []).map((item) => {
        const external = /^https?:\/\//.test(item.link);
        const target = item.link.replace(/\/+$/, "") || "/";
        return {
          text: item.text,
          link: item.link,
          external,
          active:
            !external && (path === target || path.startsWith(target + "/")),
        };
      });

      ctx.updater.set({
        siteTitle: cfg.title,
        navItems,
        searchEnabled: cfg.search ?? true,
        loading: false,
        notFound: !content,
        currentPath: path,
        contentHtml: content?.contentHtml ?? "",
        prevPage,
        nextPage,
      });
      ctx.updater.digest();
      syncDrawerInert(false);

      // Post-render enhancements.
      setTimeout(() => {
        if (ctx.signature.value !== sig) return;
        replayPageIn();
        mountCopyButtons(defaultIcons.copy, defaultIcons.check);
        renderMermaidBlocks();

        // Scroll: hash → element, otherwise → top.
        const hash = decodeURIComponent(window.location.hash.slice(1));
        if (hash) {
          document.getElementById(hash)?.scrollIntoView({ block: "start" });
        } else {
          window.scrollTo({ top: 0 });
        }
      }, 0);
    };

    return {
      template,
      events: {
        "navigateTo<click>": (e: Event) => {
          const href = findDataHref(e.target);
          if (href) {
            Router.to(href);
          }
        },
        "navigateHome<click>": () => {
          Router.to(landingLink(parseDocsConfig(State.get("docsConfig"))));
        },
        "navigateHomeDrawer<click>": () => {
          State.set({ drawerOpen: false }).digest();
          Router.to(landingLink(parseDocsConfig(State.get("docsConfig"))));
        },
        // Delegated clicks inside the rendered markdown article.
        "onContentClick<click>": (e: Event) => {
          const target = e.target;
          if (!(target instanceof Element)) return;
          const anchor = target.closest("a");
          if (!anchor) return;
          const href = anchor.getAttribute("href") ?? "";

          // In-page hash links get smooth scrolling with a deduped
          // pushState entry (copyable deep link + back-button entry
          // without the browser's instant jump).
          if (href.startsWith("#")) {
            e.preventDefault();
            let slug = href.slice(1);
            try {
              slug = decodeURIComponent(slug);
            } catch {
              // keep the raw fragment
            }
            const el = document.getElementById(slug);
            if (!el) return;
            if (decodedLocationHash() !== `#${slug}`) {
              history.pushState(null, "", href);
            }
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
          }

          // Same-origin internal links navigate through the SPA router.
          // Modified/middle clicks and explicit targets keep the browser
          // default; external links are never intercepted.
          if (href.startsWith("/")) {
            if (
              e instanceof MouseEvent &&
              (e.button !== 0 ||
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey)
            ) {
              return;
            }
            if (anchor.target && anchor.target !== "_self") return;
            e.preventDefault();
            Router.to(href);
          }
        },
        "openSearch<click>": () => {
          State.set({ searchOpen: true }).digest();
        },
        "openDrawer<click>": () => {
          State.set({ drawerOpen: true }).digest();
        },
        "closeDrawer<click>": () => {
          State.set({ drawerOpen: false }).digest();
        },
      },
    };
  });
}

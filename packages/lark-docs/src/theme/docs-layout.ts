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

interface NavLink {
  link: string;
  text: string;
}

// ============================================================
// Runtime Zod schemas for State-injected values.
// ============================================================

interface RuntimeNavItem {
  text: string;
  link: string;
  items?: RuntimeNavItem[];
}

const NavItemSchema: z.ZodType<RuntimeNavItem> = z.object({
  text: z.string(),
  link: z.string(),
  items: z.lazy(() => z.array(NavItemSchema)).optional(),
});

interface RuntimeSidebarItem {
  text: string;
  link?: string;
  collapsed?: boolean;
  items?: RuntimeSidebarItem[];
  isActive?: boolean;
}

const SidebarItemSchema: z.ZodType<RuntimeSidebarItem> = z.object({
  text: z.string(),
  link: z.string().optional(),
  collapsed: z.boolean().optional(),
  items: z.lazy(() => z.array(SidebarItemSchema)).optional(),
  isActive: z.boolean().optional(),
});

const SidebarConfigSchema = z.union([
  z.literal("auto"),
  z.array(SidebarItemSchema),
]);

const DocsConfigSchema = z.object({
  docs: z.string().optional(),
  baseUrl: z.string(),
  title: z.string(),
  description: z.string().optional(),
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

function computePrevNext(
  sidebar: RuntimeSidebarMap | undefined,
  currentPath: string,
): { prevPage: NavLink | null; nextPage: NavLink | null } {
  const flat: NavLink[] = [];
  if (sidebar) {
    for (const items of Object.values(sidebar)) {
      if (Array.isArray(items)) collectLinks(items, flat);
    }
  }
  const idx = flat.findIndex((item) => item.link === currentPath);
  if (idx < 0) return { prevPage: null, nextPage: null };
  const prevPage = idx > 0 ? flat[idx - 1] : null;
  const nextPage = idx < flat.length - 1 ? flat[idx + 1] : null;
  return { prevPage, nextPage };
}

const NAVBAR_SCROLLED_ADD = [
  "border-border/80",
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
      navigator.clipboard.writeText(code.textContent ?? "").then(() => {
        btn.classList.add("codeblock-copy-done");
        btn.innerHTML = `<span class="size-3.5 [&>svg]:size-full">${checkIcon}</span>`;
        setTimeout(() => {
          btn.classList.remove("codeblock-copy-done");
          btn.innerHTML = `<span class="size-3.5 [&>svg]:size-full">${copyIcon}</span>`;
        }, 1600);
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

    // Navbar scroll-aware styling — direct classList toggle (cheap path,
    // bypasses the updater to avoid full template re-eval on every scroll).
    useEffect(() => {
      const onScroll = () => syncNavbar(window.scrollY > 8);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    });

    // Global keyboard shortcuts: ⌘K / Ctrl+K toggles search, "/" opens.
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

    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
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
        syncDrawerSideEffects(drawerOpen);
        return;
      }

      // Close drawer on navigation.
      if (drawerOpen) {
        State.set({ drawerOpen: false }).digest();
      }

      // Show skeleton while loading.
      ctx.updater.set({ loading: true, drawerOpen: false });
      ctx.updater.digest();

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

      const { prevPage, nextPage } = computePrevNext(cfg.sidebar, path);

      // Nav items with active state (prefix match).
      const navItems = (cfg.nav ?? []).map((item) => {
        const external = /^https?:\/\//.test(item.link);
        const target = item.link.replace(/\/+$/, "") || "/";
        return {
          text: item.text,
          link: item.link,
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

      // Post-render enhancements.
      setTimeout(() => {
        if (ctx.signature.value !== sig) return;
        replayPageIn();
        mountCopyButtons(defaultIcons.copy, defaultIcons.check);

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
          const cfg = parseDocsConfig(State.get("docsConfig"));
          Router.to(cfg?.baseUrl ?? "/docs/");
        },
        "navigateHomeDrawer<click>": () => {
          State.set({ drawerOpen: false }).digest();
          const cfg = parseDocsConfig(State.get("docsConfig"));
          Router.to(cfg?.baseUrl ?? "/docs/");
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

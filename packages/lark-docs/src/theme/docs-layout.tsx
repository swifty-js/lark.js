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
  Router,
  defineView,
  jsxTemplate,
  raw,
  useEffect,
} from "@lark.js/mvc";
import type { ViewSetup } from "@lark.js/mvc";
import { z } from "zod";
import { icons as defaultIcons, clockIcons } from "./icons";
import { findDataHref } from "../utils/dom";
import { OnContentUpdateSchema } from "./hot-update";
import { renderMermaidBlocks } from "./mermaid";

interface NavLink {
  link: string;
  text: string;
}

interface NavItemVM extends NavLink {
  external: boolean;
  active: boolean;
}

interface DocsLayoutData {
  clockIcon: string;
  year: number;
  loading: boolean;
  notFound: boolean;
  drawerOpen: boolean;
  contentHtml: string;
  currentPath: string;
  prevPage: NavLink | null;
  nextPage: NavLink | null;
  navItems: NavItemVM[];
  siteTitle: string;
  searchEnabled: boolean;
}

const NAV_ITEM_BASE =
  "relative flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors duration-200 after:absolute after:inset-x-3 after:-bottom-3.25 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.32,0.72,0,1)]";

const template = jsxTemplate<DocsLayoutData>((d) => (
  <div class="bg-background text-foreground min-h-screen font-sans antialiased">
    {/* Skip to content */}
    <a
      href="#main-content"
      class="bg-primary text-primary-foreground fixed -top-full left-4 z-100 rounded-md px-[0.9rem] py-2 text-[0.8rem] font-medium transition-[top] duration-200 ease-out focus:top-3"
    >
      Skip to content
    </a>

    {/* Ambient background layers */}
    <div aria-hidden="true" class="pointer-events-none fixed inset-0 -z-10">
      <div class="absolute inset-0 bg-[radial-gradient(56rem_30rem_at_16%_-10%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_70%)]"></div>
      <div class="absolute inset-0 bg-[radial-gradient(44rem_26rem_at_96%_-4%,color-mix(in_oklab,var(--primary)_6%,transparent),transparent_70%)]"></div>
      <div class="via-primary/40 absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent"></div>
      <div class="docs-grid absolute inset-0 opacity-55 dark:opacity-30"></div>
    </div>

    {/* Fixed navbar (scroll state toggled via classList in view logic) */}
    <header
      id="docs-navbar"
      class="fixed inset-x-0 top-0 z-40 border-b border-transparent bg-transparent transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300"
    >
      <div class="mx-auto flex h-14 max-w-360 items-center gap-2 px-4 lg:px-8">
        {/* Mobile menu button */}
        <button
          class="hover:bg-accent/60 hover:text-foreground text-muted-foreground grid size-8 place-items-center rounded-md transition-colors duration-200 lg:hidden"
          onClick="openDrawer"
          aria-label="Open navigation menu"
        >
          <span class="size-4.5 [&>svg]:size-full">
            {raw(defaultIcons.menu)}
          </span>
        </button>

        {/* Logo: hour-aware clock + title */}
        <a class="group flex items-center gap-2.5" onClick="navigateHome">
          <span class="text-primary grid size-7 place-items-center transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:rotate-12 [&>svg]:size-5">
            {raw(d.clockIcon)}
          </span>
          <span class="font-display text-foreground text-[0.95rem] font-semibold tracking-tight">
            {d.siteTitle}
          </span>
        </a>

        {/* Nav items */}
        <nav
          class="ml-4 hidden items-center gap-0.5 md:flex"
          aria-label="Primary"
        >
          {d.navItems.map((item) =>
            item.external ? (
              <a
                class="after:bg-primary text-muted-foreground hover:bg-accent/60 hover:text-foreground relative flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors duration-200 after:absolute after:inset-x-3 after:-bottom-3.25 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.32,0.72,0,1)] hover:after:scale-x-100"
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.text}
                <span class="size-3 opacity-60 [&>svg]:size-full">
                  {raw(defaultIcons.arrowUpRight)}
                </span>
              </a>
            ) : (
              <a
                class={[
                  NAV_ITEM_BASE,
                  item.active
                    ? "text-foreground font-medium after:scale-x-100"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:after:scale-x-100",
                ]}
                data-href={item.link}
                onClick="navigateTo"
              >
                {item.text}
              </a>
            ),
          )}
        </nav>

        {/* Right cluster */}
        <div class="ml-auto flex items-center gap-1.5">
          {d.searchEnabled && (
            <>
              {/* Search trigger (desktop) */}
              <button
                onClick="openSearch"
                aria-label="Search documentation"
                class="group border-muted/80 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:bg-accent/60 hidden h-8 w-52 items-center gap-2 rounded-md border px-2.5 text-left text-xs transition-[border-color,background-color,width] duration-300 sm:flex lg:w-60"
              >
                <span class="size-3.5 shrink-0 opacity-70 transition-transform duration-300 group-hover:scale-110 [&>svg]:size-full">
                  {raw(defaultIcons.search)}
                </span>
                <span class="flex-1 truncate">Search documentation…</span>
                <kbd class="text-muted-foreground border-muted bg-background/80 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium">
                  ⌘K
                </kbd>
              </button>
              {/* Search trigger (mobile icon) */}
              <button
                class="hover:bg-accent/60 hover:text-foreground text-muted-foreground grid size-8 place-items-center rounded-md transition-colors duration-200 sm:hidden"
                onClick="openSearch"
                aria-label="Search documentation"
              >
                <span class="size-4.5 [&>svg]:size-full">
                  {raw(defaultIcons.search)}
                </span>
              </button>
            </>
          )}

          {/* Theme toggle */}
          <div v-lark="theme/theme-toggle"></div>
        </div>
      </div>
    </header>

    {/* Main grid */}
    <div class="mx-auto max-w-360 px-4 pt-14 lg:px-8">
      <div class="grid grid-cols-1 gap-10 lg:grid-cols-[236px_minmax(0,1fr)] xl:grid-cols-[236px_minmax(0,1fr)_224px]">
        {/* Sidebar (desktop) */}
        <aside class="hidden lg:block">
          <div class="sidebar-scroll sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-8 pr-3">
            <div v-lark="theme/sidebar"></div>
          </div>
        </aside>

        {/* Content */}
        <main id="main-content" class="min-w-0 scroll-mt-20 py-8 lg:py-10">
          {d.loading ? (
            <div class="animate-fade-in space-y-4" role="status">
              <div class="skeleton h-9 w-2/5 rounded-lg"></div>
              <div class="skeleton mt-6 h-4 w-full rounded-md"></div>
              <div class="skeleton h-4 w-11/12 rounded-md"></div>
              <div class="skeleton h-4 w-4/5 rounded-md"></div>
              <div class="skeleton mt-8 h-44 w-full rounded-xl"></div>
              <div class="skeleton mt-4 h-4 w-3/5 rounded-md"></div>
              <span class="sr-only">Loading page…</span>
            </div>
          ) : d.notFound ? (
            <div class="animate-fade-in flex flex-col items-start gap-4 py-16">
              <span class="border-muted bg-muted/40 text-muted-foreground grid size-12 place-items-center rounded-xl border [&>svg]:size-6">
                {raw(defaultIcons.compass)}
              </span>
              <h1 class="font-display text-3xl font-semibold tracking-tight">
                Page not found
              </h1>
              <p class="text-muted-foreground max-w-md text-sm leading-relaxed">
                Nothing lives at{" "}
                <code class="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs">
                  {d.currentPath}
                </code>
                . It may have moved, or the link may be out of date.
              </p>
              <button
                class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-[background-color,transform] duration-200 active:scale-[0.97]"
                onClick="navigateHome"
              >
                Back to the docs
              </button>
            </div>
          ) : (
            <>
              {/* Page content */}
              <article
                id="docs-content"
                class="prose max-w-none"
                onClick="onContentClick"
              >
                {raw(d.contentHtml)}
              </article>

              {/* Prev / Mvc pager */}
              {(d.prevPage || d.nextPage) && (
                <div class="not-prose mt-12 grid gap-3 sm:grid-cols-2">
                  {d.prevPage ? (
                    <a
                      class="group border-muted bg-background hover:border-primary/40 flex flex-col gap-1 rounded-xl border p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_-8px_rgb(0_0_0/0.12)]"
                      data-href={d.prevPage.link}
                      onClick="navigateTo"
                    >
                      <span class="text-muted-foreground flex items-center gap-1 font-mono text-[10px] font-medium tracking-[0.12em] uppercase">
                        <span class="size-3 transition-transform duration-200 group-hover:-translate-x-0.5 [&>svg]:size-full">
                          {raw(defaultIcons.arrowLeft)}
                        </span>
                        Previous
                      </span>
                      <span class="text-foreground text-sm font-medium">
                        {d.prevPage.text}
                      </span>
                    </a>
                  ) : (
                    <span class="hidden sm:block"></span>
                  )}
                  {d.nextPage && (
                    <a
                      class="group border-muted bg-background hover:border-primary/40 flex flex-col items-end gap-1 rounded-xl border p-4 text-right transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_-8px_rgb(0_0_0/0.12)]"
                      data-href={d.nextPage.link}
                      onClick="navigateTo"
                    >
                      <span class="text-muted-foreground flex items-center gap-1 font-mono text-[10px] font-medium tracking-[0.12em] uppercase">
                        Mvc
                        <span class="size-3 transition-transform duration-200 group-hover:translate-x-0.5 [&>svg]:size-full">
                          {raw(defaultIcons.arrowRight)}
                        </span>
                      </span>
                      <span class="text-foreground text-sm font-medium">
                        {d.nextPage.text}
                      </span>
                    </a>
                  )}
                </div>
              )}
            </>
          )}

          {/* Footer */}
          <footer class="border-muted/70 text-muted-foreground mt-16 flex flex-wrap items-center justify-between gap-2 border-t pt-5 pb-10 text-xs">
            <span>
              © {d.year} {d.siteTitle}
            </span>
            <span class="font-mono">
              Built with <span class="text-primary">@lark.js/docs</span>
            </span>
          </footer>
        </main>

        {/* TOC (right rail) */}
        <aside class="hidden xl:block">
          <div class="sidebar-scroll sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-10">
            <div v-lark="theme/toc"></div>
          </div>
        </aside>
      </div>
    </div>

    {/* Mobile navigation drawer */}
    <div
      id="docs-drawer"
      class={[
        !d.drawerOpen && "pointer-events-none",
        "fixed inset-0 z-50 lg:hidden",
      ]}
      aria-hidden={d.drawerOpen ? "false" : "true"}
    >
      <div
        class={[
          d.drawerOpen ? "opacity-100" : "opacity-0",
          "bg-foreground/25 absolute inset-0 backdrop-blur-[2px] transition-opacity duration-300 dark:bg-black/50",
        ]}
        onClick="closeDrawer"
      ></div>
      <div
        id="docs-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        class={[
          d.drawerOpen ? "translate-x-0" : "-translate-x-full",
          "border-muted bg-background absolute inset-y-0 left-0 flex w-72 flex-col border-r shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        ]}
      >
        <div class="border-muted/70 flex h-14 shrink-0 items-center justify-between border-b px-4">
          <a class="flex items-center gap-2" onClick="navigateHomeDrawer">
            <span class="text-primary [&>svg]:size-5">{raw(d.clockIcon)}</span>
            <span class="font-display text-sm font-semibold tracking-tight">
              {d.siteTitle}
            </span>
          </a>
          <button
            class="hover:bg-accent/60 text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-md transition-colors duration-200"
            onClick="closeDrawer"
            aria-label="Close navigation menu"
          >
            <span class="size-4.5 [&>svg]:size-full">
              {raw(defaultIcons.x)}
            </span>
          </button>
        </div>
        <div class="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 py-6">
          <div v-lark="theme/sidebar"></div>
        </div>
      </div>
    </div>

    {/* Search dialog */}
    {d.searchEnabled && <div v-lark="theme/search"></div>}
  </div>
));

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

export function createDocsLayoutView(): ViewSetup {
  return defineView((ctx) => {
    const clockIcon = clockIcons[new Date().getHours() % 12] ?? clockIcons[0];
    ctx.updater.set({
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

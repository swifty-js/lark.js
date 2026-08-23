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
 * Sidebar View - navigation tree with collapsible groups.
 *
 * Renders sidebar groups with grid-rows collapse animation, active
 * border-left indicators, and auto-expansion of the active group.
 * Nested items are flattened into depth-annotated rows.
 */
import { State, Router, defineView, jsxTemplate, raw } from "@lark.js/mvc";
import type { LarkView, LarkEvent } from "@lark.js/mvc";
import { z } from "zod";
import { icons } from "./icons";
import type { SidebarItem } from "../types";
import { findDataHref } from "../utils/dom";

const SidebarItemSchema: z.ZodType<SidebarItem> = z.object({
  text: z.string(),
  link: z.string().optional(),
  collapsed: z.boolean().optional(),
  items: z.lazy(() => z.array(SidebarItemSchema)).optional(),
});
const SidebarConfigSchema = z.union([
  z.literal("auto"),
  z.array(SidebarItemSchema),
]);
const SidebarMapSchema = z.record(z.string(), SidebarConfigSchema);
const SidebarDocsConfigSchema = z.object({
  sidebar: SidebarMapSchema.optional(),
  baseUrl: z.string().optional(),
});

interface SidebarRow {
  key: string;
  text: string;
  link: string;
  depth: number;
  padPx: number;
  isActive: boolean;
  isGroup: boolean;
  groupOpen: boolean;
  containsActive: boolean;
}

interface SidebarGroup {
  key: string;
  text: string;
  collapsed: boolean;
  rows: SidebarRow[];
}

interface SidebarData {
  sidebarGroups: SidebarGroup[];
}

function stripSlash(p: string): string {
  return p.replace(/\/+$/, "") || "/";
}

function containsLink(items: SidebarItem[], path: string): boolean {
  for (const item of items) {
    if (item.link && stripSlash(item.link) === path) return true;
    if (item.items && containsLink(item.items, path)) return true;
  }
  return false;
}

function formatPrefix(prefix: string, baseUrl = "/"): string {
  let p = prefix;
  const base = baseUrl.replace(/\/+$/, "");
  if (base && (p === base || p.startsWith(base + "/"))) {
    p = p.slice(base.length);
  }
  const title = p
    .replace(/^\//, "")
    .replace(/\/$/, "")
    .replace(/[-/]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  if (title) return title;
  return prefix
    .replace(/^\//, "")
    .replace(/\/$/, "")
    .replace(/[-/]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function createSidebarView(): LarkView {
  return defineView((ctx) => {
    ctx.observeLocation([], true);

    // User toggle state survives re-renders (closure, keyed by group path).
    // Groups default to expanded; auto-expansion only fires when a group
    // gains the active route (transition), so users can still collapse it.
    const groupCollapsed = new Map<string, boolean>();
    const nestedCollapsed = new Map<string, boolean>();
    const prevGroupActive = new Map<string, boolean>();
    const prevNestedActive = new Map<string, boolean>();

    const assign = (): boolean | undefined => {
      ctx.updater.snapshot();

      const parsed = SidebarDocsConfigSchema.safeParse(State.get("docsConfig"));
      const sidebar = parsed.success ? (parsed.data.sidebar ?? {}) : {};
      const baseUrl = parsed.success ? (parsed.data.baseUrl ?? "/") : "/";
      const currentPath =
        (Router.parse().path || "").replace(/\/+$/, "") || "/";

      const sidebarGroups: SidebarGroup[] = [];

      for (const [prefix, sidebarItems] of Object.entries(sidebar)) {
        if (!Array.isArray(sidebarItems)) continue;

        const key = prefix;
        const containsActive = containsLink(sidebarItems, currentPath);
        if (containsActive && !prevGroupActive.get(key)) {
          groupCollapsed.delete(key);
        }
        prevGroupActive.set(key, containsActive);

        const rows: SidebarRow[] = [];
        flattenItems(
          sidebarItems,
          currentPath,
          nestedCollapsed,
          prevNestedActive,
          key,
          0,
          rows,
        );

        sidebarGroups.push({
          key,
          text: formatPrefix(prefix, baseUrl),
          collapsed: groupCollapsed.get(key) ?? false,
          rows,
        });
      }

      ctx.updater.set({ sidebarGroups });
      return ctx.updater.altered();
    };

    assign();

    const toggleGroup = (e: LarkEvent): void => {
      const el = findDataAttr(e.target, "key");
      if (!el) return;
      const key = el.dataset["key"] ?? "";
      groupCollapsed.set(key, !(groupCollapsed.get(key) ?? false));
      ctx.updater.snapshot();
      assign();
      ctx.updater.digest();
    };

    const toggleNested = (e: LarkEvent): void => {
      const el = findDataAttr(e.target, "key");
      if (!el) return;
      const key = el.dataset["key"] ?? "";
      nestedCollapsed.set(key, !(nestedCollapsed.get(key) ?? false));
      ctx.updater.snapshot();
      assign();
      ctx.updater.digest();
    };

    const navigateTo = (e: LarkEvent): void => {
      const href = findDataHref(e.target);
      if (href) {
        Router.to(href);
        // Close the mobile drawer if open.
        if (State.get("drawerOpen")) {
          State.set({ drawerOpen: false }).digest();
        }
      }
    };

    const template = jsxTemplate<SidebarData>(({ sidebarGroups }) => (
      <nav class="flex flex-col" aria-label="Documentation">
        {sidebarGroups.map((group) => (
          <div class="mb-6">
            <button
              data-key={group.key}
              onClick={toggleGroup}
              aria-expanded={group.collapsed ? "false" : "true"}
              class="group text-muted-foreground hover:text-foreground flex w-full items-center justify-between rounded-md px-2 py-1.5 font-mono text-[11px] font-semibold tracking-[0.14em] uppercase transition-colors duration-200"
            >
              {group.text}
              <span
                class={[
                  "size-3.5 opacity-60 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] [&>svg]:size-full",
                  group.collapsed && "-rotate-90",
                ]}
              >
                {raw(icons.chevronDown)}
              </span>
            </button>
            <div
              class={[
                "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                group.collapsed
                  ? "grid-rows-[0fr] opacity-0"
                  : "grid-rows-[1fr] opacity-100",
              ]}
            >
              <div class="overflow-hidden">
                <ul class="border-muted/70 mt-1.5 ml-2 border-l pl-px">
                  {group.rows.map((row) => (
                    <li>
                      {row.isGroup ? (
                        <button
                          data-key={row.key}
                          onClick={toggleNested}
                          aria-expanded={row.groupOpen ? "true" : "false"}
                          class={[
                            "flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-[13px] font-medium transition-colors duration-200",
                            row.containsActive
                              ? "text-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          ]}
                          style={`padding-left: ${row.padPx}px`}
                        >
                          <span
                            class={[
                              "size-3.5 shrink-0 opacity-60 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] [&>svg]:size-full",
                              row.groupOpen && "rotate-90",
                            ]}
                          >
                            {raw(icons.chevronRight)}
                          </span>
                          {row.text}
                        </button>
                      ) : (
                        <a
                          data-href={row.link}
                          onClick={navigateTo}
                          aria-current={row.isActive ? "page" : undefined}
                          class={[
                            "relative -ml-px block border-l-2 py-1.5 pr-2 text-[13px] leading-snug transition-[color,background-color,border-color] duration-200",
                            row.isActive
                              ? "border-primary bg-primary/8 text-primary font-medium"
                              : "hover:border-muted hover:bg-accent/50 hover:text-foreground text-muted-foreground border-transparent",
                          ]}
                          style={`padding-left: ${row.padPx}px`}
                        >
                          {row.text}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </nav>
    ));

    return { template, assign };
  });
}

function flattenItems(
  items: SidebarItem[],
  currentPath: string,
  nestedCollapsed: Map<string, boolean>,
  prevNestedActive: Map<string, boolean>,
  parentKey: string,
  depth: number,
  out: SidebarRow[],
): void {
  for (const item of items) {
    const hasChildren = Array.isArray(item.items) && item.items.length > 0;
    const key = `${parentKey}/${item.text}`;

    if (hasChildren) {
      const containsActive = containsLink(item.items!, currentPath);
      if (containsActive && !prevNestedActive.get(key)) {
        nestedCollapsed.delete(key);
      }
      prevNestedActive.set(key, containsActive);

      const open = !(nestedCollapsed.get(key) ?? item.collapsed === true);

      out.push({
        key,
        text: item.text,
        link: "",
        depth,
        padPx: 10 + depth * 14,
        isActive: false,
        isGroup: true,
        groupOpen: open,
        containsActive,
      });
      if (open) {
        flattenItems(
          item.items!,
          currentPath,
          nestedCollapsed,
          prevNestedActive,
          key,
          depth + 1,
          out,
        );
      }
    } else {
      const link = item.link ?? "";
      out.push({
        key,
        text: item.text,
        link,
        depth,
        padPx: 14 + depth * 14,
        isActive: !!link && stripSlash(link) === currentPath,
        isGroup: false,
        groupOpen: false,
        containsActive: false,
      });
    }
  }
}

function findDataAttr(
  target: EventTarget | null,
  attr: string,
): HTMLElement | null {
  let el = target instanceof HTMLElement ? target : null;
  while (el && !el.dataset[attr]) el = el.parentElement;
  return el;
}

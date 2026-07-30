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
import { State, Router, defineView } from "@lark.js/mvc";
import type { VDomTemplate, ViewSetup, ViewTemplate } from "@lark.js/mvc";
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

export function createSidebarView(
  template: ViewTemplate | VDomTemplate,
): ViewSetup {
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

      ctx.updater.set({ sidebarGroups, icons });
      return ctx.updater.altered();
    };

    assign();

    return {
      template,
      assign,
      events: {
        "toggleGroup<click>": (e: Event) => {
          const el = findDataAttr(e.target, "key");
          if (!el) return;
          const key = el.dataset["key"] ?? "";
          groupCollapsed.set(key, !(groupCollapsed.get(key) ?? false));
          ctx.updater.snapshot();
          assign();
          ctx.updater.digest();
        },
        "toggleNested<click>": (e: Event) => {
          const el = findDataAttr(e.target, "key");
          if (!el) return;
          const key = el.dataset["key"] ?? "";
          nestedCollapsed.set(key, !(nestedCollapsed.get(key) ?? false));
          ctx.updater.snapshot();
          assign();
          ctx.updater.digest();
        },
        "navigateTo<click>": (e: Event) => {
          const href = findDataHref(e.target);
          if (href) {
            Router.to(href);
            // Close the mobile drawer if open.
            if (State.get("drawerOpen")) {
              State.set({ drawerOpen: false }).digest();
            }
          }
        },
      },
    };
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

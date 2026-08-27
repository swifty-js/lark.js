import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DefaultTheme, MarkdownRenderer } from "vitepress";

export const MERMAID_TAG = "wc-mermaid";

const EXCLUDED_DIRS = new Set(["node_modules", "dist", "public"]);

function listEntries(dir: string) {
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => !entry.name.startsWith("."));
}

function getShallowDirs(docsDir: string): string[] {
  return listEntries(docsDir)
    .filter((entry) => entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function buildItems(docsDir: string, dir: string): DefaultTheme.SidebarItem[] {
  return listEntries(join(docsDir, dir))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
    .flatMap((entry): DefaultTheme.SidebarItem[] => {
      if (entry.isDirectory()) {
        const items = buildItems(docsDir, `${dir}/${entry.name}`);
        if (items.length === 0) return [];
        return [
          {
            text: entry.name,
            collapsed: true,
            items,
          },
        ];
      }
      if (!entry.name.endsWith(".md") || entry.name === "index.md") return [];
      const name = entry.name.replace(/\.md$/, "");
      return [
        {
          text: name,
          link: `/${dir}/${name}`,
        },
      ];
    });
}

function buildNavItems(docsDir: string, dir: string): DefaultTheme.NavItemWithLink[] {
  return listEntries(join(docsDir, dir))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "index.md")
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => {
      const name = fileName.replace(/\.md$/, "");
      return {
        text: name,
        link: `/${dir}/${name}`,
      };
    });
}

export function buildSidebar(srcDir = "."): DefaultTheme.Sidebar {
  const docsDir = resolve(process.cwd(), srcDir);
  return Object.fromEntries(
    getShallowDirs(docsDir).map((dir) => [
      `/${dir}/`,
      [{ text: dir, items: buildItems(docsDir, dir) }],
    ]),
  );
}

export function buildNav(srcDir = "."): DefaultTheme.NavItem[] {
  const docsDir = resolve(process.cwd(), srcDir);
  return [
    { text: "homepage", link: "/" },
    ...getShallowDirs(docsDir).map((dir) => ({
      text: dir,
      items: buildNavItems(docsDir, dir),
      activeMatch: `^/${dir}/`,
    })),
  ];
}

export function installMermaidFence(md: MarkdownRenderer): void {
  const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules);
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token.info.trim() === "mermaid") {
      const graph = encodeURIComponent(token.content);
      return `<${MERMAID_TAG} graph="${graph}"></${MERMAID_TAG}>\n`;
    }
    return defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };
}

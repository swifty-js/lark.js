import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig, type DefaultTheme, type MarkdownRenderer, type UserConfig } from "vitepress";

const PKG = "@lark.js/docs";

const MERMAID_TAG = "wc-mermaid";

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

function buildSidebar(docsDir: string): DefaultTheme.Sidebar {
  return Object.fromEntries(
    getShallowDirs(docsDir).map((dir) => [
      `/${dir}/`,
      [{ text: dir, items: buildItems(docsDir, dir) }],
    ]),
  );
}

function buildNav(docsDir: string): DefaultTheme.NavItem[] {
  return [
    { text: "homepage", link: "/" },
    ...getShallowDirs(docsDir).map((dir) => ({
      text: dir,
      items: buildNavItems(docsDir, dir),
      activeMatch: `^/${dir}/`,
    })),
  ];
}

function installMermaidFence(md: MarkdownRenderer): void {
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

type NoExternal = string | RegExp | (string | RegExp)[] | true;

function withPkgNoExternal(noExternal: NoExternal | undefined): NoExternal {
  if (noExternal === true) return true;
  if (noExternal === undefined) return [PKG];
  return Array.isArray(noExternal) ? [...noExternal, PKG] : [noExternal, PKG];
}

export function defineDocsConfig(
  config: UserConfig<DefaultTheme.Config> = {},
): UserConfig<DefaultTheme.Config> {
  const docsDir = resolve(process.cwd(), config.srcDir ?? ".");

  const userMarkdownConfig = config.markdown?.config;
  const userIsCustomElement = config.vue?.template?.compilerOptions?.isCustomElement;
  const userVite = config.vite ?? {};

  return defineConfig({
    ...config,
    themeConfig: {
      ...config.themeConfig,
      nav: config.themeConfig?.nav ?? buildNav(docsDir),
      sidebar: config.themeConfig?.sidebar ?? buildSidebar(docsDir),
    },
    markdown: {
      ...config.markdown,
      config(md) {
        installMermaidFence(md);
        userMarkdownConfig?.(md);
      },
    },
    vue: {
      ...config.vue,
      template: {
        ...config.vue?.template,
        compilerOptions: {
          ...config.vue?.template?.compilerOptions,
          isCustomElement: (tag) => tag === MERMAID_TAG || (userIsCustomElement?.(tag) ?? false),
        },
      },
    },
    vite: {
      ...userVite,
      optimizeDeps: {
        ...userVite.optimizeDeps,
        exclude: [...(userVite.optimizeDeps?.exclude ?? []), PKG],
      },
      ssr: {
        ...userVite.ssr,
        noExternal: withPkgNoExternal(userVite.ssr?.noExternal as NoExternal | undefined),
      },
    },
  });
}

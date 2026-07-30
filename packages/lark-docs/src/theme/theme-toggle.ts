import { defineView, useState, useResource } from "@lark.js/mvc";
import type { VDomTemplate, ViewSetup, ViewTemplate } from "@lark.js/mvc";
import { icons } from "./icons";

const STORAGE_KEY = "lark-docs-theme";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function isDark(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return systemPrefersDark();
}

export function createThemeToggleView(
  template: ViewTemplate | VDomTemplate,
): ViewSetup {
  return defineView((ctx) => {
    const [getDark, setDark] = useState("dark", isDark());
    ctx.updater.set({ icons });

    // Keep in sync if another instance or devtools flips the class.
    const observer = new MutationObserver(() => {
      const nowDark = document.documentElement.classList.contains("dark");
      if (nowDark !== getDark()) setDark(nowDark);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    useResource("themeObserver", {
      destroy: () => observer.disconnect(),
    });

    return {
      template,
      events: {
        "toggle<click>": () => {
          const next = !getDark();
          setDark(next);
          document.documentElement.classList.toggle("dark", next);
          localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
        },
      },
    };
  });
}

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
  defineView,
  jsxTemplate,
  raw,
  useState,
  useResource,
} from "@lark.js/mvc";
import type { LarkView } from "@lark.js/mvc";
import { icons } from "./icons";

const STORAGE_KEY = "lark-docs-theme";

interface ThemeToggleData {
  dark: boolean;
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function isDark(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark") return true;
    if (stored === "light") return false;
  } catch {
    // storage unavailable
  }
  return systemPrefersDark();
}

export function createThemeToggleView(): LarkView {
  return defineView(() => {
    const [getDark, setDark] = useState("dark", isDark());

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

    const toggle = (): void => {
      const next = !getDark();
      setDark(next);
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
      } catch {
        // storage unavailable
      }
    };

    const template = jsxTemplate<ThemeToggleData>(({ dark }) => (
      <button
        class="hover:bg-accent/60 text-muted-foreground hover:text-foreground relative grid size-8 place-items-center rounded-md transition-colors duration-200"
        onClick={toggle}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      >
        <span
          class={[
            "absolute size-4.5 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] [&>svg]:size-full",
            dark ? "rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0",
          ]}
        >
          {raw(icons.moon)}
        </span>
        <span
          class={[
            "absolute size-4.5 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] [&>svg]:size-full",
            dark ? "scale-50 rotate-90 opacity-0" : "rotate-0 opacity-100",
          ]}
        >
          {raw(icons.sun)}
        </span>
      </button>
    ));

    return { template };
  });
}

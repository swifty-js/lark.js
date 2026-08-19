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

import { defineView, useState, useResource } from "@lark.js/mvc";
import type { ViewSetup, ViewTemplate } from "@lark.js/mvc";
import { icons } from "./icons";

const STORAGE_KEY = "lark-docs-theme";

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

export function createThemeToggleView(template: ViewTemplate): ViewSetup {
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
          try {
            localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
          } catch {
            // storage unavailable
          }
        },
      },
    };
  });
}

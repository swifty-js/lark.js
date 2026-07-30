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
 * Centralized icon registry for @lark.js/docs theme views.
 *
 * Imports individual SVG files from lucide-static as raw strings (Vite ?raw).
 * Each icon is a complete `<svg>...</svg>` markup string at build time.
 *
 * Usage in theme templates (via {{!}} raw output operator):
 *   {{!icons.search}}
 *
 * Icons inherit `currentColor` from their parent container, so color is
 * controlled via Tailwind text-color utilities on the wrapper <span>.
 */
import search from "lucide-static/icons/search.svg?raw";
import menu from "lucide-static/icons/menu.svg?raw";
import x from "lucide-static/icons/x.svg?raw";
import sun from "lucide-static/icons/sun.svg?raw";
import moon from "lucide-static/icons/moon.svg?raw";
import chevronDown from "lucide-static/icons/chevron-down.svg?raw";
import chevronRight from "lucide-static/icons/chevron-right.svg?raw";
import copy from "lucide-static/icons/copy.svg?raw";
import check from "lucide-static/icons/check.svg?raw";
import list from "lucide-static/icons/list.svg?raw";
import arrowUpRight from "lucide-static/icons/arrow-up-right.svg?raw";
import arrowLeft from "lucide-static/icons/arrow-left.svg?raw";
import arrowRight from "lucide-static/icons/arrow-right.svg?raw";
import compass from "lucide-static/icons/compass.svg?raw";
import clock1 from "lucide-static/icons/clock-1.svg?raw";
import clock2 from "lucide-static/icons/clock-2.svg?raw";
import clock3 from "lucide-static/icons/clock-3.svg?raw";
import clock4 from "lucide-static/icons/clock-4.svg?raw";
import clock5 from "lucide-static/icons/clock-5.svg?raw";
import clock6 from "lucide-static/icons/clock-6.svg?raw";
import clock7 from "lucide-static/icons/clock-7.svg?raw";
import clock8 from "lucide-static/icons/clock-8.svg?raw";
import clock9 from "lucide-static/icons/clock-9.svg?raw";
import clock10 from "lucide-static/icons/clock-10.svg?raw";
import clock11 from "lucide-static/icons/clock-11.svg?raw";
import clock12 from "lucide-static/icons/clock-12.svg?raw";

export const icons = {
  search,
  menu,
  x,
  sun,
  moon,
  chevronDown,
  chevronRight,
  copy,
  check,
  list,
  arrowUpRight,
  arrowLeft,
  arrowRight,
  compass,
};

export const clockIcons = [
  clock12,
  clock1,
  clock2,
  clock3,
  clock4,
  clock5,
  clock6,
  clock7,
  clock8,
  clock9,
  clock10,
  clock11,
];

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
  Framework,
  registerViewClass,
  type FrameworkConfig,
} from "@lark.js/mvc";
import { initLarkSentry, instrumentView } from "@lark.js/sentry";
import { enablePlugin } from "@swifty.js/sentry";
import {
  PerformancePlugin,
  ScreenRecordPlugin,
  ExposurePlugin,
} from "@swifty.js/sentry/plugins";
import gameView from "./views/game";
import "./main.css";

// Views registered synchronously bypass the `require` loader, so they must
// be instrumented explicitly.
registerViewClass(
  "views/game",
  instrumentView(gameView, { viewPath: "views/game" }),
);

const config: FrameworkConfig = {
  rootId: "app",
  routeMode: "hash",
  defaultPath: "/game",
  defaultView: "views/game",
  routes: { "/game": "views/game" },
  vdom: false,
};

Framework.boot(config);

// Must run after Framework.boot so the instrumentation wraps the final
// framework configuration. In dev the dsn is served by the sentry Vite
// mock plugin (see vite.config.ts), which writes reports to logs/.
initLarkSentry({
  dsn: "/api/log",
  projectId: "gomoku",
  debug: import.meta.env.DEV,
  beforePushEventList(eventList) {
    if (!import.meta.env.DEV) {
      console.log("@swifty.js/sentry App:", eventList);
      return false;
    }
    return eventList;
  },
});

enablePlugin(new PerformancePlugin());
enablePlugin(new ScreenRecordPlugin());
enablePlugin(new ExposurePlugin());

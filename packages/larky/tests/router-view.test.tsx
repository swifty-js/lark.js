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
  render,
  unmount,
  nextTick,
  createRouter,
  RouterView,
  useRouter,
  useEffect,
  type RouterApi,
} from "@lark.js/larky";
import { createContainer, stripAnchors } from "./helpers";

describe("RouterView", () => {
  let container: HTMLElement;
  let router: RouterApi;

  beforeEach(() => {
    container = createContainer();
  });

  afterEach(() => {
    unmount(container);
    container.remove();
    router.dispose();
    globalThis.history.replaceState(null, "", "/");
  });

  it("renders the matched component and swaps on navigation", async () => {
    function Home() {
      return <h1>home</h1>;
    }
    function About() {
      return <h1>about</h1>;
    }
    router = createRouter([
      { path: "/", component: Home },
      { path: "/about", component: About },
      { path: "*", component: () => <h1>404</h1> },
    ]);
    render(<RouterView router={router} />, container);
    expect(stripAnchors(container.innerHTML)).toBe("<h1>home</h1>");

    await router.navigate("/about");
    await nextTick();
    expect(stripAnchors(container.innerHTML)).toBe("<h1>about</h1>");

    await router.navigate("/nope");
    await nextTick();
    expect(stripAnchors(container.innerHTML)).toBe("<h1>404</h1>");
  });

  it("param-only change keeps the SAME instance and re-renders tracked readers", async () => {
    let mounts = 0;
    function UserDetail() {
      const r = useRouter();
      useEffect(() => {
        mounts++; // mount-only — runs once per INSTANCE
      });
      return <p>user:{r.params.value["id"]}</p>;
    }
    router = createRouter([
      { path: "/", component: () => null },
      { path: "/users/:id", component: UserDetail },
    ]);
    await router.navigate("/users/1");
    render(<RouterView router={router} />, container);
    await nextTick();
    expect(container.textContent).toContain("user:1");
    expect(mounts).toBe(1);

    await router.navigate("/users/2");
    await nextTick();
    expect(container.textContent).toContain("user:2");
    expect(mounts).toBe(1); // re-render, not a fresh mount
  });

  it("lazy routes resolve once and render when the load lands", async () => {
    function Admin() {
      return <h1>admin</h1>;
    }
    let loads = 0;
    router = createRouter([
      { path: "/", component: () => <h1>home</h1> },
      {
        path: "/admin",
        lazy: () => {
          loads++;
          return Promise.resolve({ default: Admin });
        },
      },
    ]);
    render(<RouterView router={router} />, container);

    await router.navigate("/admin");
    await vi.waitFor(() => {
      expect(stripAnchors(container.innerHTML)).toBe("<h1>admin</h1>");
    });
    expect(loads).toBe(1);

    // Round-trip: the resolved component is cached on the route.
    await router.navigate("/");
    await nextTick();
    await router.navigate("/admin");
    await nextTick();
    expect(stripAnchors(container.innerHTML)).toBe("<h1>admin</h1>");
    expect(loads).toBe(1);
  });
});

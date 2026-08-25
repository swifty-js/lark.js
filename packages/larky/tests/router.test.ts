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

import { createRouter, matchPath, matchRoutes, useRouter, type RouterApi } from "@lark.js/larky";

function Dummy() {
  return null;
}

describe("matchPath", () => {
  it("matches static segments case-insensitively", () => {
    expect(matchPath("/users", "/Users")).toEqual({});
    expect(matchPath("/users", "/posts")).toBeNull();
  });

  it("captures :params (decoded)", () => {
    expect(matchPath("/users/:id", "/users/42")).toEqual({ id: "42" });
    expect(matchPath("/users/:id", "/users/a%20b")).toEqual({ id: "a b" });
    expect(matchPath("/users/:id", "/users")).toBeNull();
    expect(matchPath("/users/:id", "/users/42/extra")).toBeNull();
  });

  it("captures trailing splats", () => {
    expect(matchPath("/files/*", "/files/a/b.txt")).toEqual({ "*": "a/b.txt" });
    expect(matchPath("*", "/anything/at/all")).toEqual({ "*": "anything/at/all" });
  });
});

describe("matchRoutes ranking", () => {
  it("static > dynamic > splat; ties resolve by registration order", () => {
    const routes = [
      { path: "*", component: Dummy },
      { path: "/users/:id", component: Dummy },
      { path: "/users/new", component: Dummy },
    ];
    expect(matchRoutes(routes, "/users/new")!.route.path).toBe("/users/new");
    expect(matchRoutes(routes, "/users/42")!.route.path).toBe("/users/:id");
    expect(matchRoutes(routes, "/elsewhere")!.route.path).toBe("*");
  });
});

describe("createRouter", () => {
  let router: RouterApi;

  afterEach(() => {
    router.dispose();
    globalThis.history.replaceState(null, "", "/");
  });

  it("navigates, updates location/params/searchParams, and pushes history", async () => {
    router = createRouter([
      { path: "/", component: Dummy },
      { path: "/users/:id", component: Dummy },
    ]);
    expect(router.location.value.pathname).toBe("/");

    const ok = await router.navigate("/users/42?tab=posts#top", { state: { from: "home" } });
    expect(ok).toBe(true);
    expect(globalThis.location.pathname).toBe("/users/42");
    expect(router.location.value).toMatchObject({
      pathname: "/users/42",
      search: "?tab=posts",
      hash: "#top",
      state: { from: "home" },
    });
    expect(router.params.value).toEqual({ id: "42" });
    expect(router.searchParams.value.get("tab")).toBe("posts");
    expect(router.match.value!.route.path).toBe("/users/:id");
  });

  it("navigating to the current href replaces instead of pushing", async () => {
    router = createRouter([{ path: "*", component: Dummy }]);
    await router.navigate("/same");
    const key1 = router.location.value.key;
    await router.navigate("/same");
    expect(router.location.value.key).not.toBe(key1);
    expect((globalThis.history.state as { idx: number }).idx).toBe(1); // still index 1
  });

  it("blockers can reject navigations (navigate resolves false)", async () => {
    router = createRouter([{ path: "*", component: Dummy }]);
    const unblock = router.block((next) => next.pathname !== "/forbidden");

    expect(await router.navigate("/allowed")).toBe(true);
    expect(router.location.value.pathname).toBe("/allowed");

    expect(await router.navigate("/forbidden")).toBe(false);
    expect(router.location.value.pathname).toBe("/allowed");

    unblock();
    expect(await router.navigate("/forbidden")).toBe(true);
  });

  it("strips the basename from the public location and prefixes hrefs", async () => {
    globalThis.history.replaceState(null, "", "/app/dash");
    router = createRouter([{ path: "/dash", component: Dummy }], { basename: "/app" });
    expect(router.location.value.pathname).toBe("/dash");
    expect(router.match.value!.route.path).toBe("/dash");

    await router.navigate("/other");
    expect(globalThis.location.pathname).toBe("/app/other");
    expect(router.location.value.pathname).toBe("/other");
  });

  it("useRouter resolves the active (last created) router and throws when disposed", () => {
    router = createRouter([{ path: "*", component: Dummy }]);
    expect(useRouter()).toBe(router);
    router.dispose();
    expect(() => useRouter()).toThrow(/no active router/);
    router = createRouter([{ path: "*", component: Dummy }]); // for afterEach dispose
  });
});

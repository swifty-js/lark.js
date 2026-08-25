import { useEffect, useState } from "@lark.js/react";

/**
 * Minimal history router — the lark-react replacement for lark-mvc's
 * `createRouter` / `RouterView`. lark-react ships no router, so this is a
 * small external store over the History API: `navigate` pushes a path,
 * `popstate` syncs back, and `useRouter` re-renders the subscribing
 * component (the shell) on every location change. Route matching happens
 * in the shell, not here.
 */
export interface RouteLocation {
  pathname: string;
  search: string;
}

export interface Router {
  location: RouteLocation;
  navigate(to: string): void;
  subscribe(listener: () => void): () => void;
  createPath(to: string): string;
}

export function createRouter(basename = ""): Router {
  const base = basename.replace(/^\/+|\/+$/g, "");

  const parse = (): RouteLocation => {
    let pathname = window.location.pathname;
    if (base) {
      const prefix = `/${base}`;
      if (pathname === prefix) pathname = "/";
      else if (pathname.startsWith(`${prefix}/`)) pathname = pathname.slice(prefix.length);
    }
    return { pathname: pathname || "/", search: window.location.search };
  };

  const listeners = new Set<() => void>();
  const router: Router = {
    location: parse(),
    navigate(to) {
      window.history.pushState(null, "", router.createPath(to));
      router.location = parse();
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    createPath(to) {
      const full = base ? `/${base}${to === "/" ? "" : to}` : to;
      return full || "/";
    },
  };

  window.addEventListener("popstate", () => {
    router.location = parse();
    for (const l of listeners) l();
  });

  return router;
}

/** Subscribe a component to router location changes. */
export function useRouter(router: Router): RouteLocation {
  const [, bump] = useState(0);
  useEffect(() => router.subscribe(() => bump((v) => v + 1)), [router]);
  return router.location;
}

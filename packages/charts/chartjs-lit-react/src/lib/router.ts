import { signal, type Signal } from "./signal";
import type { VNode } from "@lark.js/react";

export interface RouteEntry {
  path: string;
  component: () => VNode | null;
}

export interface RouterApi {
  location: Signal<{ pathname: string; search: string }>;
  navigate(path: string): void;
  routes: RouteEntry[];
  basename: string;
}

function matchRoute(routes: RouteEntry[], pathname: string): RouteEntry | undefined {
  const exact = routes.find((r) => r.path === pathname);
  if (exact) return exact;
  return routes.find((r) => r.path === "*");
}

export function createRouter(routes: RouteEntry[], opts: { basename?: string } = {}): RouterApi {
  const basename = opts.basename || "";

  const readLocation = () => {
    const { pathname, search } = window.location;
    const stripped = basename ? pathname.replace(new RegExp(`^/${basename}`), "") || "/" : pathname;
    return { pathname: stripped, search };
  };

  const location = signal(readLocation());

  window.addEventListener("popstate", () => {
    location.value = readLocation();
  });

  return {
    location,
    routes,
    basename,
    navigate(path: string) {
      const url = basename ? `/${basename}${path}` : path;
      window.history.pushState(null, "", url);
      location.value = readLocation();
    },
  };
}

export function RouterView({ router }: { router: RouterApi }) {
  const { pathname } = router.location.value;
  const route = matchRoute(router.routes, pathname);
  if (!route) return null;
  return route.component();
}

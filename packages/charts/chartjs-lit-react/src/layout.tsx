import { useState, useEffect, useRef } from "@lark.js/react";
import type { RouterApi } from "@/lib/router";
import "@/components";

export default function Layout({ router }: { router: RouterApi }) {
  const [currentPath, setCurrentPath] = useState(router.location.value.pathname);
  const shell = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const off = router.location.subscribe(() => {
      setCurrentPath(router.location.value.pathname);
    });
    return off;
  }, [router]);

  useEffect(() => {
    const el = shell.current;
    if (!el) return;
    const onNav = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (typeof path === "string") router.navigate(path);
    };
    el.addEventListener("nav-request", onNav);
    return () => el.removeEventListener("nav-request", onNav);
  }, [router]);

  const isEditor = currentPath === "/editor";

  const route =
    router.routes.find((r) => r.path === currentPath) ?? router.routes.find((r) => r.path === "*");

  return (
    <div
      ref={shell}
      className={`flex flex-col ${isEditor ? "h-screen overflow-hidden" : "min-h-screen"}`}
    >
      <wc-header activePath={currentPath} />

      <main className={`min-h-0 flex-1 ${isEditor ? "flex flex-col overflow-hidden" : ""}`}>
        {route ? route.component() : null}
      </main>

      {!isEditor && <wc-footer />}

      <wc-auth-modal />
    </div>
  );
}

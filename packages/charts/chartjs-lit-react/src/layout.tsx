import { RouterView, useEffect, useRef, useRouter } from "@lark.js/react";
import type { RouterApi } from "@lark.js/react";
import "@/components";

/**
 * App shell over @lark.js/react's router: useRouter subscribes this
 * component to navigation, <RouterView/> renders the matched Lit page.
 * Lit components request navigation through the `nav-request` CustomEvent
 * bridge (they cannot call the router hook themselves).
 */
export default function Layout({ router }: { router: RouterApi }) {
  const { location } = useRouter(router);
  const currentPath = location.pathname;
  const shell = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = shell.current;
    if (!el) return;
    const onNav = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (typeof path === "string") void router.navigate(path);
    };
    el.addEventListener("nav-request", onNav);
    return () => el.removeEventListener("nav-request", onNav);
  }, [router]);

  const isEditor = currentPath === "/editor";

  return (
    <div
      ref={shell}
      className={`flex flex-col ${isEditor ? "h-screen overflow-hidden" : "min-h-screen"}`}
    >
      <wc-header activePath={currentPath} />

      <main className={`min-h-0 flex-1 ${isEditor ? "flex flex-col overflow-hidden" : ""}`}>
        <RouterView router={router} />
      </main>

      {!isEditor && <wc-footer />}

      <wc-auth-modal />
    </div>
  );
}

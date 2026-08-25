import { RouterView, type RouterApi } from "@lark.js/mvc";
import "@/components";
import type { WcHeader } from "@/components/wc-header";
import { useRef, useEffect } from "@lark.js/mvc";

/**
 * The ONLY lark component: the app shell. It owns routing (RouterView),
 * forwards the active path into the Lit header, and translates the Lit
 * components' bubbling `nav-request` CustomEvents into router.navigate
 * calls. Everything below this level is Lit.
 */
export default function Layout({ router }: { router: RouterApi }) {
  const currentPath = router.location.value.pathname;
  const isEditor = currentPath === "/editor";
  const shell = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = shell.current;
    if (!el) return;
    const onNav = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (typeof path === "string") router.navigate(path);
    };
    el.addEventListener("nav-request", onNav);
    return () => el.removeEventListener("nav-request", onNav);
  });

  return (
    <div
      ref={shell}
      class={`flex flex-col ${isEditor ? "h-screen overflow-hidden" : "min-h-screen"}`}
    >
      <wc-header activePath={currentPath} />

      <main
        class={`min-h-0 flex-1 ${isEditor ? "flex flex-col overflow-hidden" : ""}`}
      >
        <RouterView router={router} />
      </main>

      {!isEditor && <wc-footer />}

      <wc-auth-modal />
    </div>
  );
}

export type { WcHeader };

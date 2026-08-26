import { render, createRouter } from "@lark.js/mvc";
import "./style.css";
import { useAuthStore } from "./lib/auth-store";
import Layout from "./layout";

/**
 * lark-mvc owns ONLY routing and the outermost shell. Each route mounts
 * one Lit page component; page-internal navigation bubbles up via
 * `nav-request` CustomEvents which Layout translates into
 * router.navigate().
 */
const router = createRouter(
  [
    { path: "/", component: () => <wc-plaza-page activePath="/" /> },
    { path: "/plaza", component: () => <wc-plaza-page activePath="/plaza" /> },
    {
      path: "/projects",
      component: () => <wc-projects-page activePath="/projects" />,
    },
    {
      path: "/editor",
      component: () => <wc-editor-page activePath="/editor" />,
    },
    {
      path: "/help",
      component: () => <wc-help-page activePath="/help" />,
    },
    {
      path: "*",
      component: () => <wc-not-found-page activePath="*" />,
    },
  ],
  { basename: "lark.js" },
);

async function enableMocking(): Promise<void> {
  // The GitHub Pages deploy has no real backend, so mock whenever
  // VITE_API_BASE is unset (it stays unset in local dev too).
  if (import.meta.env.VITE_API_BASE) return;
  const { worker } = await import("./mocks/browser");
  // Await the Service Worker registration so the initial auth/charts
  // requests are guaranteed to be intercepted. The worker script is only
  // served under the Vite base path ("/lark.js/mockServiceWorker.js"),
  // so registering MSW's default "/mockServiceWorker.js" would 404.
  await worker.start({
    onUnhandledRequest: "bypass",
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });
}

enableMocking().then(() => {
  useAuthStore.getState().fetchUser();
  render(<Layout router={router} />, document.getElementById("app")!);
});

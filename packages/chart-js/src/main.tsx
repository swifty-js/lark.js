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
const router = createRouter([
  { path: "/", component: () => <cp-plaza-page activePath="/" /> },
  { path: "/plaza", component: () => <cp-plaza-page activePath="/plaza" /> },
  {
    path: "/projects",
    component: () => <cp-projects-page activePath="/projects" />,
  },
  {
    path: "/editor",
    component: () => <cp-editor-page activePath="/editor" />,
  },
  {
    path: "/help",
    component: () => <cp-help-page activePath="/help" />,
  },
  {
    path: "*",
    component: () => <cp-not-found-page activePath="*" />,
  },
], { basename: "lark.js" });

async function enableMocking(): Promise<void> {
  if (import.meta.env.PROD) return;
  const { worker } = await import("./mocks/browser");
  // Await the Service Worker registration so the initial auth/charts
  // requests are guaranteed to be intercepted.
  await worker.start({ onUnhandledRequest: "bypass" });
}

enableMocking().then(() => {
  useAuthStore.getState().fetchUser();
  render(<Layout router={router} />, document.getElementById("app")!);
});

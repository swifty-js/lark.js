import { createRoot, createRouter } from "@lark.js/react";
import "./style.css";
import { useAuthStore } from "@/lib/auth-store";
import Layout from "@/layout";
import PlazaPage from "@/components/plaza-page";
import ProjectsPage from "@/components/projects-page";
import EditorPage from "@/components/editor-page";
import HelpPage from "@/components/help-page";
import NotFoundPage from "@/components/not-found-page";

/**
 * lark-react owns routing and the whole tree (function components end to
 * end — no Lit). Routing is @lark.js/react's history router: pages navigate
 * via `useRouter().navigate`, Layout renders the match through <RouterView/>.
 */
export const router = createRouter(
  [
    { path: "/", component: PlazaPage },
    { path: "/plaza", component: PlazaPage },
    { path: "/projects", component: ProjectsPage },
    { path: "/editor", component: EditorPage },
    { path: "/help", component: HelpPage },
    { path: "*", component: NotFoundPage },
  ],
  { basename: "/lark.js" },
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
  createRoot(document.getElementById("app")!).render(<Layout router={router} />);
});

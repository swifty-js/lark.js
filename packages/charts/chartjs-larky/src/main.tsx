import { render, createRouter } from "@lark.js/larky";
import "./style.css";
import { useAuthStore } from "./lib/auth-store";
import Layout from "./components/layout";
import PlazaPage from "./components/plaza-page";
import ProjectsPage from "./components/projects-page";
import EditorPage from "./components/editor-page";
import HelpPage from "./components/help-page";
import NotFoundPage from "./components/not-found-page";

const router = createRouter(
  [
    { path: "/", component: PlazaPage },
    { path: "/plaza", component: PlazaPage },
    { path: "/projects", component: ProjectsPage },
    { path: "/editor", component: EditorPage },
    { path: "/help", component: HelpPage },
    { path: "*", component: NotFoundPage },
  ],
  { basename: "lark.js" },
);

async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_API_BASE) return;
  const { worker } = await import("./mocks/browser");
  await worker.start({
    onUnhandledRequest: "bypass",
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });
}

enableMocking().then(() => {
  useAuthStore.getState().fetchUser();
  render(<Layout router={router} />, document.getElementById("app")!);
});

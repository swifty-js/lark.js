import { render } from "@lark.js/react";
import "./style.css";
import { useAuthStore } from "./lib/auth-store";
import Layout from "./layout";
import { createRouter } from "./lib/router";

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

import { useRouter, type Router } from "@/lib/router";
import Header from "@/components/header";
import Footer from "@/components/footer";
import AuthModal from "@/components/auth-modal";
import PlazaPage from "@/components/plaza-page";
import ProjectsPage from "@/components/projects-page";
import EditorPage from "@/components/editor-page";
import HelpPage from "@/components/help-page";
import NotFoundPage from "@/components/not-found-page";

const ROUTES: { path: string; render: (navigate: (to: string) => void) => any }[] = [
  { path: "/", render: (n) => <PlazaPage navigate={n} /> },
  { path: "/plaza", render: (n) => <PlazaPage navigate={n} /> },
  { path: "/projects", render: (n) => <ProjectsPage navigate={n} /> },
  { path: "/editor", render: (n) => <EditorPage navigate={n} /> },
  { path: "/help", render: (n) => <HelpPage navigate={n} /> },
  { path: "*", render: (n) => <NotFoundPage navigate={n} /> },
];

/**
 * App shell: subscribes to the router, renders header / matched page /
 * footer, and hosts the global auth modal. Page-internal navigation is a
 * plain `navigate` prop (the Lit `nav-request` CustomEvent bridge is gone
 * — everything is lark-react now).
 */
export default function Layout({ router }: { router: Router }) {
  const location = useRouter(router);
  const isEditor = location.pathname === "/editor";
  const match =
    ROUTES.find((r) => r.path === location.pathname) ?? ROUTES.find((r) => r.path === "*")!;

  return (
    <div className={`flex flex-col ${isEditor ? "h-screen overflow-hidden" : "min-h-screen"}`}>
      <Header activePath={location.pathname} navigate={router.navigate} />

      <main className={`min-h-0 flex-1 ${isEditor ? "flex flex-col overflow-hidden" : ""}`}>
        {match.render(router.navigate)}
      </main>

      {!isEditor && <Footer />}

      <AuthModal />
    </div>
  );
}

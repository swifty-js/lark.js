import { RouterView, useRouter } from "@lark.js/react";
import type { RouterApi } from "@lark.js/react";
import Header from "@/components/header";
import Footer from "@/components/footer";
import AuthModal from "@/components/auth-modal";

/**
 * App shell: subscribes to the router (useRouter), renders header /
 * matched page (<RouterView/>) / footer, and hosts the global auth modal.
 * Pages resolve navigation themselves via `useRouter().navigate`.
 */
export default function Layout({ router }: { router: RouterApi }) {
  const { location } = useRouter(router);
  const isEditor = location.pathname === "/editor";

  return (
    <div className={`flex flex-col ${isEditor ? "h-screen overflow-hidden" : "min-h-screen"}`}>
      <Header activePath={location.pathname} navigate={router.navigate} />

      <main className={`min-h-0 flex-1 ${isEditor ? "flex flex-col overflow-hidden" : ""}`}>
        <RouterView router={router} />
      </main>

      {!isEditor && <Footer />}

      <AuthModal />
    </div>
  );
}

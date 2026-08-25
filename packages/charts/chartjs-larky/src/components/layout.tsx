import { RouterView, type RouterApi } from "@lark.js/larky";
import Header from "@/components/header";
import Footer from "@/components/footer";
import AuthModal from "@/components/auth-modal";

export default function Layout({ router }: { router: RouterApi }) {
  const currentPath = router.location.value.pathname;
  const isEditor = currentPath === "/editor";

  return (
    <div class={`flex flex-col ${isEditor ? "h-screen overflow-hidden" : "min-h-screen"}`}>
      <Header />

      <main class={`min-h-0 flex-1 ${isEditor ? "flex flex-col overflow-hidden" : ""}`}>
        <RouterView router={router} />
      </main>

      {!isEditor && <Footer />}

      <AuthModal />
    </div>
  );
}

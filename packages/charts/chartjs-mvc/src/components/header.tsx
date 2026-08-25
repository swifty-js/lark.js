import { useSignal, useRef, useEffect, useSignalEffect, useRouter } from "@lark.js/mvc";
import { raw } from "@lark.js/mvc/jsx-runtime";
import { useAuthStore } from "@/lib/auth-store";
import { openAuthModal } from "@/lib/ui";
import { icon } from "@/lib/icons";
import { animateIn, animatePop } from "@/lib/anim";

const NAV_ITEMS = [
  { path: "/plaza", label: "Chart Plaza", icon: "globe" },
  { path: "/projects", label: "My Projects", icon: "folder" },
  { path: "/editor", label: "Visual Editor", icon: "code" },
  { path: "/help", label: "Help", icon: "layers" },
] as const;

export default function Header() {
  const router = useRouter();
  const activePath = router.location.value.pathname;
  const { loggedIn, user } = useAuthStore.getState();
  const dropdownOpen = useSignal(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const popAnimated = useRef(false);

  useEffect(() => {
    const el = headerRef.current;
    if (el) animateIn(el, "[data-anim]", { y: -10, stagger: 0.04, duration: 0.4 });
    const close = () => (dropdownOpen.value = false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  });

  useSignalEffect(() => {
    if (dropdownOpen.value && !popAnimated.current && popRef.current) {
      popAnimated.current = true;
      animatePop(popRef.current);
    }
    if (!dropdownOpen.value) popAnimated.current = false;
  });

  return (
    <header
      ref={headerRef}
      class="bg-surface/75 border-border sticky top-0 z-40 border-b backdrop-blur-xl backdrop-saturate-150"
    >
      <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div class="flex items-center gap-8">
          <button
            data-anim
            class="flex items-center gap-0.5 text-lg font-semibold tracking-tight"
            onClick={() => router.navigate("/plaza")}
          >
            Chart<span class="text-brand">js</span>
          </button>
          <nav class="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <button
                data-anim
                class={`${
                  activePath === item.path
                    ? "bg-brand/10 font-medium text-brand"
                    : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"
                } flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all duration-200`}
                onClick={() => router.navigate(item.path)}
              >
                {raw(`<span class="inline-flex opacity-70">${icon(item.icon, 14)}</span>`)}
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {!loggedIn ? (
          <button
            data-anim
            class="bg-brand hover:bg-brand-hover hover:shadow-glow rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.03] active:scale-95"
            onClick={() => openAuthModal()}
          >
            Sign in
          </button>
        ) : (
          <div class="relative" onClick={(e: Event) => e.stopPropagation()}>
            <button
              data-anim
              class="border-border hover:border-brand/40 hover:bg-surface-alt flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-all"
              onClick={() => (dropdownOpen.value = !dropdownOpen.value)}
            >
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt=""
                  class="ring-brand/30 h-7 w-7 rounded-full object-cover ring-2"
                />
              ) : (
                <span class="bg-brand/15 text-brand flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold">
                  {(user?.username || "?").charAt(0).toUpperCase()}
                </span>
              )}
              <span class="text-text-primary max-w-28 truncate">{user?.username}</span>
              {raw(
                `<span class="text-text-tertiary inline-flex transition-transform ${dropdownOpen.value ? "rotate-180" : ""}">${icon("chevronDown", 14)}</span>`,
              )}
            </button>
            {dropdownOpen.value && (
              <div
                class="animate-scale-in border-border bg-surface absolute top-full right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border shadow-xl"
                ref={popRef}
              >
                <div class="border-border bg-surface-alt border-b px-4 py-2.5">
                  <p class="text-text-primary truncate text-sm font-medium">{user?.username}</p>
                  <p class="text-text-tertiary truncate text-xs">{user?.email}</p>
                </div>
                <button
                  class="text-text-secondary hover:bg-danger-light hover:text-danger flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors"
                  onClick={() => {
                    dropdownOpen.value = false;
                    useAuthStore.getState().logout();
                  }}
                >
                  {raw(`<span class="inline-flex">${icon("logout", 14)}</span>`)}
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

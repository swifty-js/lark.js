import { useEffect, useRef, useState } from "@lark.js/react";
import { Icon } from "@/components/Icon";
import { useAuthStore } from "@/lib/auth-store";
import { useStore } from "@/lib/store";
import { openAuthModal } from "@/lib/ui";
import { animateIn, animatePop } from "@/lib/anim";

export const NAV_ITEMS = [
  { path: "/plaza", label: "Chart Plaza", icon: "globe" },
  { path: "/projects", label: "My Projects", icon: "folder" },
  { path: "/editor", label: "Visual Editor", icon: "code" },
  { path: "/help", label: "Help", icon: "layers" },
] as const;

/**
 * App header: brand, primary nav, auth area. Navigation is a direct
 * `navigate` prop call (the Lit `nav-request` CustomEvent bridge is gone).
 */
export default function Header({
  activePath,
  navigate,
}: {
  activePath: string;
  navigate: (to: string) => void;
}) {
  const { loggedIn, user } = useStore(useAuthStore);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Close the dropdown on any outside click.
  useEffect(() => {
    const close = () => setDropdownOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // Entrance choreography, once on mount.
  useEffect(() => {
    if (headerRef.current) {
      animateIn(headerRef.current, "[data-anim]", {
        y: -10,
        stagger: 0.04,
        duration: 0.4,
      });
    }
  }, []);

  // Pop-in once per dropdown-open.
  useEffect(() => {
    if (dropdownOpen && popRef.current) animatePop(popRef.current);
  }, [dropdownOpen]);

  const u = user;

  return (
    <header
      ref={headerRef}
      className="bg-surface/75 border-border sticky top-0 z-40 border-b backdrop-blur-xl backdrop-saturate-150"
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <button
            data-anim
            className="flex items-center gap-0.5 text-lg font-semibold tracking-tight"
            onClick={() => navigate("/plaza")}
          >
            Chart<span className="text-brand">js</span>
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.path}
                data-anim
                className={`${
                  activePath === item.path
                    ? "bg-brand/10 font-medium text-brand"
                    : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"
                } flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all duration-200`}
                onClick={() => navigate(item.path)}
              >
                <Icon name={item.icon} size={14} className="opacity-70" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {!loggedIn ? (
          <button
            data-anim
            className="bg-brand hover:bg-brand-hover hover:shadow-glow rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.03] active:scale-95"
            onClick={() => openAuthModal()}
          >
            Sign in
          </button>
        ) : (
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              data-anim
              className="border-border hover:border-brand/40 hover:bg-surface-alt flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-all"
              onClick={() => setDropdownOpen((o) => !o)}
            >
              {u?.avatar ? (
                <img
                  src={u.avatar}
                  alt=""
                  className="ring-brand/30 h-7 w-7 rounded-full object-cover ring-2"
                />
              ) : (
                <span className="bg-brand/15 text-brand flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold">
                  {(u?.username || "?").charAt(0).toUpperCase()}
                </span>
              )}
              <span className="text-text-primary max-w-28 truncate">{u?.username}</span>
              <Icon
                name="chevronDown"
                size={14}
                className={`text-text-tertiary transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            {dropdownOpen && (
              <div
                ref={popRef}
                className="animate-scale-in border-border bg-surface absolute top-full right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border shadow-xl"
              >
                <div className="border-border bg-surface-alt border-b px-4 py-2.5">
                  <p className="text-text-primary truncate text-sm font-medium">{u?.username}</p>
                  <p className="text-text-tertiary truncate text-xs">{u?.email}</p>
                </div>
                <button
                  className="text-text-secondary hover:bg-danger-light hover:text-danger flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors"
                  onClick={() => {
                    setDropdownOpen(false);
                    useAuthStore.getState().logout();
                  }}
                >
                  <Icon name="logout" size={14} />
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

import { useEffect, useRef, useState } from "@lark.js/react";
import { Icon } from "@/components/Icon";
import { loginApi, registerApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useStore } from "@/lib/store";
import { uiStore, closeAuthModal } from "@/lib/ui";
import { animatePop } from "@/lib/anim";
import type { IconName } from "@/lib/icons";

/**
 * Login / register modal. Visibility follows `uiStore.showAuthModal`.
 */
export default function AuthModal() {
  const { showAuthModal: open } = useStore(uiStore);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Pop-in once per open (not on every keystroke-driven re-render).
  useEffect(() => {
    if (open && dialogRef.current) animatePop(dialogRef.current);
  }, [open]);

  const close = () => closeAuthModal();

  const switchMode = (m: "login" | "register") => {
    setMode(m);
    setErrorMsg("");
  };

  const submit = () => {
    const e = email.trim();
    if (!e || !password) {
      setErrorMsg("Email and password are required");
      return;
    }
    setSubmitting(true);
    setErrorMsg("");

    const done = (ok: boolean, message: string) => {
      setSubmitting(false);
      if (ok) {
        useAuthStore.getState().fetchUser();
        close();
      } else {
        setErrorMsg(message || "Something went wrong");
      }
    };

    if (mode === "login") {
      loginApi({ email: e, password })
        .then((res) => done(res.ok, res.message))
        .catch(() => done(false, "Network error"));
    } else {
      registerApi({ email: e, password, username: username.trim() || undefined })
        .then((res) => done(res.ok, res.message))
        .catch(() => done(false, "Network error"));
    }
  };

  const field = (
    label: string,
    iconName: IconName,
    type: string,
    value: string,
    placeholder: string,
    onInput: (v: string) => void,
    onEnter?: () => void,
  ) => (
    <div>
      <label className="text-text-secondary mb-1.5 block text-xs font-semibold tracking-wide">
        {label}
      </label>
      <div className="group border-border focus-within:border-brand focus-within:ring-brand/20 bg-surface-alt/60 relative flex items-center rounded-xl border transition-all focus-within:ring-3">
        <span className="text-text-tertiary group-focus-within:text-brand pointer-events-none ml-3 inline-flex">
          <Icon name={iconName} size={15} />
        </span>
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          className="placeholder:text-text-tertiary/60 text-text-primary w-full bg-transparent px-3 py-2.5 text-sm outline-none"
          onInput={(e) => onInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) onEnter();
          }}
        />
      </div>
    </div>
  );

  if (!open) return null;
  const isLogin = mode === "login";

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        ref={dialogRef}
        className="border-border bg-surface shadow-modal animate-scale-in relative w-full max-w-sm overflow-hidden rounded-2xl border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* decorative header band */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28">
          <div className="bg-brand/10 pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full blur-2xl"></div>
        </div>
        <button
          className="text-text-tertiary hover:bg-surface-alt hover:text-text-primary absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          onClick={close}
          aria-label="Close"
        >
          <Icon name="x" size={16} />
        </button>

        <div className="relative px-8 pt-8 pb-7">
          <div className="mb-7 text-center">
            <div className="bg-brand shadow-glow mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white">
              <Icon name="chartBar" size={26} />
            </div>
            <h2 className="text-text-primary text-xl font-bold tracking-tight">
              {isLogin ? "Welcome back" : "Create your account"}
            </h2>
            <p className="text-text-secondary mt-1.5 text-sm">
              {isLogin ? "Sign in to continue to chart.js" : "Join chart.js to manage your charts"}
            </p>
          </div>

          {/* mode switch pills */}
          <div className="bg-surface-alt mb-6 grid grid-cols-2 gap-1 rounded-xl p-1" role="tablist">
            {(
              [
                ["login", "Sign in"],
                ["register", "Sign up"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={mode === value}
                className={`${
                  mode === value
                    ? "bg-surface text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                } rounded-lg py-2 text-sm font-medium transition-all duration-200`}
                onClick={() => switchMode(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {errorMsg && (
            <div className="bg-danger/10 text-danger animate-scale-in mb-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm">
              <Icon name="alertCircle" size={15} /> {errorMsg}
            </div>
          )}

          <div className="space-y-4">
            {!isLogin &&
              field("USERNAME", "user", "text", username, "Display name (optional)", setUsername)}
            {field("EMAIL", "globe", "email", email, "you@example.com", setEmail)}
            {field("PASSWORD", "code", "password", password, "Enter password", setPassword, submit)}
          </div>

          <button
            className="bg-brand hover:bg-brand-hover hover:shadow-glow mt-6 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.01] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            disabled={submitting}
            onClick={submit}
          >
            {submitting ? "Please wait..." : isLogin ? "Sign in" : "Create account"}
          </button>

          <p className="text-text-tertiary mt-5 text-center text-xs leading-relaxed">
            By continuing you agree to chart.js's terms of service and privacy policy.
          </p>
        </div>
      </div>
    </div>
  );
}

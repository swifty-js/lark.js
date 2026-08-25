import { raw, useSignal, useSignalEffect, useRef } from "@lark.js/larky";
import { loginApi, registerApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { closeAuthModal, showAuthModal } from "@/lib/ui";
import { animatePop } from "@/lib/anim";
import { icon } from "@/lib/icons";

export default function AuthModal() {
  const dialogRef = useRef<HTMLDivElement>(null);

  const mode = useSignal<"login" | "register">("login");
  const email = useSignal("");
  const password = useSignal("");
  const username = useSignal("");
  const errorMsg = useSignal("");
  const submitting = useSignal(false);

  const open = showAuthModal.value;

  const popAnimated = useRef(false);
  useSignalEffect(() => {
    if (showAuthModal.value && !popAnimated.current && dialogRef.current) {
      popAnimated.current = true;
      animatePop(dialogRef.current);
    }
    if (!showAuthModal.value) popAnimated.current = false;
  });

  const close = () => closeAuthModal();

  const switchMode = (m: "login" | "register") => {
    mode.value = m;
    errorMsg.value = "";
  };

  const submit = () => {
    const e = email.value.trim();
    const p = password.value;
    if (!e || !p) {
      errorMsg.value = "Email and password are required";
      return;
    }
    submitting.value = true;
    errorMsg.value = "";

    const done = (ok: boolean, message: string) => {
      submitting.value = false;
      if (ok) {
        useAuthStore.getState().fetchUser();
        close();
      } else {
        errorMsg.value = message || "Something went wrong";
      }
    };

    if (mode.value === "login") {
      loginApi({ email: e, password: p })
        .then((res) => done(res.ok, res.message))
        .catch(() => done(false, "Network error"));
    } else {
      const u = username.value.trim();
      registerApi({ email: e, password: p, username: u || undefined })
        .then((res) => done(res.ok, res.message))
        .catch(() => done(false, "Network error"));
    }
  };

  if (!open) return null;

  const isLogin = mode.value === "login";

  const field = (
    label: string,
    iconName: "user" | "globe" | "code",
    type: string,
    value: string,
    placeholder: string,
    onInput: (v: string) => void,
    onEnter?: () => void,
  ) => (
    <div>
      <label class="text-text-secondary mb-1.5 block text-xs font-semibold tracking-wide">
        {label}
      </label>
      <div class="group border-border focus-within:border-brand focus-within:ring-brand/20 bg-surface-alt/60 relative flex items-center rounded-xl border transition-all focus-within:ring-3">
        <span class="text-text-tertiary group-focus-within:text-brand pointer-events-none ml-3 inline-flex">
          {raw(icon(iconName, 15))}
        </span>
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          class="placeholder:text-text-tertiary/60 text-text-primary w-full bg-transparent px-3 py-2.5 text-sm outline-none"
          onInput={(e) => onInput((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) onEnter();
          }}
        />
      </div>
    </div>
  );

  return (
    <div
      class="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        ref={dialogRef}
        class="border-border bg-surface shadow-modal animate-scale-in relative w-full max-w-sm overflow-hidden rounded-2xl border"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="pointer-events-none absolute inset-x-0 top-0 h-28">
          <div class="bg-brand/10 pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full blur-2xl"></div>
        </div>
        <button
          class="text-text-tertiary hover:bg-surface-alt hover:text-text-primary absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          onClick={close}
          aria-label="Close"
        >
          {raw(icon("x", 16))}
        </button>

        <div class="relative px-8 pt-8 pb-7">
          <div class="mb-7 text-center">
            <div class="bg-brand shadow-glow mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white">
              {raw(icon("chartBar", 26))}
            </div>
            <h2 class="text-text-primary text-xl font-bold tracking-tight">
              {isLogin ? "Welcome back" : "Create your account"}
            </h2>
            <p class="text-text-secondary mt-1.5 text-sm">
              {isLogin ? "Sign in to continue to chart.js" : "Join chart.js to manage your charts"}
            </p>
          </div>

          <div class="bg-surface-alt mb-6 grid grid-cols-2 gap-1 rounded-xl p-1" role="tablist">
            {(
              [
                ["login", "Sign in"],
                ["register", "Sign up"],
              ] as const
            ).map(([value, label]) => (
              <button
                role="tab"
                aria-selected={mode.value === value}
                class={`${
                  mode.value === value
                    ? "bg-surface text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                } rounded-lg py-2 text-sm font-medium transition-all duration-200`}
                onClick={() => switchMode(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {errorMsg.value && (
            <div class="bg-danger/10 text-danger animate-scale-in mb-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm">
              {raw(icon("alertCircle", 15))} {errorMsg.value}
            </div>
          )}

          <div class="space-y-4">
            {!isLogin &&
              field(
                "USERNAME",
                "user",
                "text",
                username.value,
                "Display name (optional)",
                (v) => (username.value = v),
              )}
            {field(
              "EMAIL",
              "globe",
              "email",
              email.value,
              "you@example.com",
              (v) => (email.value = v),
            )}
            {field(
              "PASSWORD",
              "code",
              "password",
              password.value,
              "Enter password",
              (v) => (password.value = v),
              submit,
            )}
          </div>

          <button
            class="bg-brand hover:bg-brand-hover hover:shadow-glow mt-6 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.01] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            disabled={submitting.value}
            onClick={submit}
          >
            {submitting.value ? "Please wait..." : isLogin ? "Sign in" : "Create account"}
          </button>

          <p class="text-text-tertiary mt-5 text-center text-xs leading-relaxed">
            By continuing you agree to chart.js's terms of service and privacy policy.
          </p>
        </div>
      </div>
    </div>
  );
}

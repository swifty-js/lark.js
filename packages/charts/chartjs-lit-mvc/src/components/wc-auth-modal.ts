import { customElement, state } from "lit/decorators.js";
import type { TemplateResult } from "lit";
import { ref, createRef } from "lit/directives/ref.js";
import { WcElement, html, nothing } from "@/components/base";
import { loginApi, registerApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { closeAuthModal, showAuthModal } from "@/lib/ui";
import { animatePop } from "@/lib/anim";
import { icon } from "@/lib/icons";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { effect } from "@lark.js/mvc";

/**
 * Login / register modal. Visibility follows the `showAuthModal` signal
 * from the lark ui state module.
 */
@customElement("wc-auth-modal")
export class WcAuthModal extends WcElement {
  @state() private open = false;
  @state() private mode: "login" | "register" = "login";
  @state() private email = "";
  @state() private password = "";
  @state() private username = "";
  @state() private errorMsg = "";
  @state() private submitting = false;

  private dialogRef = createRef<HTMLElement>();
  private popAnimated = false;
  private offUi?: () => void;

  override connectedCallback(): void {
    super.connectedCallback();
    this.offUi = effect(() => {
      this.open = showAuthModal.value;
    });
  }

  override disconnectedCallback(): void {
    this.offUi?.();
    super.disconnectedCallback();
  }

  private close() {
    closeAuthModal();
  }

  private switchMode(mode: "login" | "register") {
    this.mode = mode;
    this.errorMsg = "";
  }

  private submit() {
    const email = this.email.trim();
    const password = this.password;
    if (!email || !password) {
      this.errorMsg = "Email and password are required";
      return;
    }
    this.submitting = true;
    this.errorMsg = "";

    const done = (ok: boolean, message: string) => {
      this.submitting = false;
      if (ok) {
        useAuthStore.getState().fetchUser();
        this.close();
      } else {
        this.errorMsg = message || "Something went wrong";
      }
    };

    if (this.mode === "login") {
      loginApi({ email, password })
        .then((res) => done(res.ok, res.message))
        .catch(() => done(false, "Network error"));
    } else {
      const username = this.username.trim();
      registerApi({ email, password, username: username || undefined })
        .then((res) => done(res.ok, res.message))
        .catch(() => done(false, "Network error"));
    }
  }

  private field(
    label: string,
    iconName: "user" | "globe" | "code",
    type: string,
    value: string,
    placeholder: string,
    onInput: (v: string) => void,
    onEnter?: () => void,
  ): TemplateResult {
    return html`
      <div>
        <label
          class="text-text-secondary mb-1.5 block text-xs font-semibold tracking-wide"
        >
          ${label}
        </label>
        <div
          class="group border-border focus-within:border-brand focus-within:ring-brand/20 bg-surface-alt/60 relative flex items-center rounded-xl border transition-all focus-within:ring-3"
        >
          <span
            class="text-text-tertiary group-focus-within:text-brand pointer-events-none ml-3 inline-flex"
          >
            ${unsafeHTML(icon(iconName, 15))}
          </span>
          <input
            type=${type}
            .value=${value}
            placeholder=${placeholder}
            class="placeholder:text-text-tertiary/60 text-text-primary w-full bg-transparent px-3 py-2.5 text-sm outline-none"
            @input=${(e: InputEvent) =>
              onInput((e.target as HTMLInputElement).value)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" && onEnter) onEnter();
            }}
          />
        </div>
      </div>
    `;
  }

  protected override updated(): void {
    // Play the pop-in ONCE when the dialog appears — not on every
    // keystroke-driven state update (email/password chars re-run updated).
    if (this.open && !this.popAnimated && this.dialogRef.value) {
      this.popAnimated = true;
      animatePop(this.dialogRef.value);
    }
    if (!this.open) this.popAnimated = false;
  }

  protected override render(): TemplateResult | typeof nothing {
    if (!this.open) return nothing;
    const isLogin = this.mode === "login";
    return html`
      <div
        class="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        @click=${() => this.close()}
      >
        <div
          class="border-border bg-surface shadow-modal animate-scale-in relative w-full max-w-sm overflow-hidden rounded-2xl border"
          @click=${(e: Event) => e.stopPropagation()}
          ${ref(this.dialogRef)}
        >
          <!-- decorative header band -->
          <div class="events-none absolute inset-x-0 top-0 h-28">
            <div
              class="bg-brand/10 pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full blur-2xl"
            ></div>
          </div>
          <button
            class="text-text-tertiary hover:bg-surface-alt hover:text-text-primary absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            @click=${() => this.close()}
            aria-label="Close"
          >
            ${unsafeHTML(icon("x", 16))}
          </button>

          <div class="relative px-8 pt-8 pb-7">
            <div class="mb-7 text-center">
              <div
                class="bg-brand shadow-glow mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white"
              >
                ${unsafeHTML(icon("chartBar", 26))}
              </div>
              <h2 class="text-text-primary text-xl font-bold tracking-tight">
                ${isLogin ? "Welcome back" : "Create your account"}
              </h2>
              <p class="text-text-secondary mt-1.5 text-sm">
                ${
                  isLogin
                    ? "Sign in to continue to chart.js"
                    : "Join chart.js to manage your charts"
                }
              </p>
            </div>

            <!-- mode switch pills -->
            <div
              class="bg-surface-alt mb-6 grid grid-cols-2 gap-1 rounded-xl p-1"
              role="tablist"
            >
              ${(
                [
                  ["login", "Sign in"],
                  ["register", "Sign up"],
                ] as const
              ).map(
                ([value, label]) => html`
                  <button
                    role="tab"
                    aria-selected=${this.mode === value}
                    class="${
                      this.mode === value
                        ? "bg-surface text-text-primary shadow-sm"
                        : "text-text-secondary hover:text-text-primary"
                    } rounded-lg py-2 text-sm font-medium transition-all duration-200"
                    @click=${() => this.switchMode(value)}
                  >
                    ${label}
                  </button>
                `,
              )}
            </div>

            ${
              this.errorMsg
                ? html`<div
                    class="bg-danger/10 text-danger animate-scale-in mb-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm"
                  >
                    ${unsafeHTML(icon("alertCircle", 15))} ${this.errorMsg}
                  </div>`
                : nothing
            }

            <div class="space-y-4">
              ${
                !isLogin
                  ? this.field(
                      "USERNAME",
                      "user",
                      "text",
                      this.username,
                      "Display name (optional)",
                      (v) => (this.username = v),
                    )
                  : nothing
              }
              ${this.field(
                "EMAIL",
                "globe",
                "email",
                this.email,
                "you@example.com",
                (v) => (this.email = v),
              )}
              ${this.field(
                "PASSWORD",
                "code",
                "password",
                this.password,
                "Enter password",
                (v) => (this.password = v),
                () => this.submit(),
              )}
            </div>

            <button
              class="bg-brand hover:bg-brand-hover hover:shadow-glow mt-6 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.01] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
              ?disabled=${this.submitting}
              @click=${() => this.submit()}
            >
              ${
                this.submitting
                  ? "Please wait..."
                  : isLogin
                    ? "Sign in"
                    : "Create account"
              }
            </button>

            <p
              class="text-text-tertiary mt-5 text-center text-xs leading-relaxed"
            >
              By continuing you agree to chart.js's terms of service and privacy
              policy.
            </p>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "wc-auth-modal": WcAuthModal;
  }
}

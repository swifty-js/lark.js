import { customElement, property, state } from "lit/decorators.js";
import type { TemplateResult } from "lit";
import { ref, createRef } from "lit/directives/ref.js";
import { WcElement, html, nothing, unsafeHTML } from "@/components/base";
import { useAuthStore } from "@/lib/auth-store";
import { openAuthModal } from "@/lib/ui";
import { icon } from "@/lib/icons";
import { animateIn, animatePop } from "@/lib/anim";
import { effect } from "@lark.js/larky";
import type { UserInfo } from "@/lib/api";

export const NAV_ITEMS = [
  { path: "/plaza", label: "Chart Plaza", icon: "globe" },
  { path: "/projects", label: "My Projects", icon: "folder" },
  { path: "/editor", label: "Visual Editor", icon: "code" },
  { path: "/help", label: "Help", icon: "layers" },
] as const;

@customElement("wc-header")
export class WcHeader extends WcElement {
  @property() activePath = "";

  @state() private user: UserInfo | null = null;
  @state() private loggedIn = false;
  @state() private dropdownOpen = false;

  private popRef = createRef<HTMLElement>();
  private popAnimated = false;

  private offAuth?: () => void;

  override connectedCallback(): void {
    super.connectedCallback();
    this.offAuth = effect(() => {
      const { loggedIn, user } = useAuthStore.getState();
      this.loggedIn = loggedIn;
      this.user = user;
    });
    const close = () => (this.dropdownOpen = false);
    document.addEventListener("click", close);
    this._close = close;
  }

  private _close = () => {};

  override disconnectedCallback(): void {
    this.offAuth?.();
    document.removeEventListener("click", this._close);
    super.disconnectedCallback();
  }

  protected override firstUpdated(): void {
    animateIn(this, "[data-anim]", { y: -10, stagger: 0.04, duration: 0.4 });
  }

  protected override updated(): void {
    if (this.dropdownOpen && !this.popAnimated && this.popRef.value) {
      this.popAnimated = true;
      animatePop(this.popRef.value);
    }
    if (!this.dropdownOpen) this.popAnimated = false;
  }

  private nav(path: string) {
    this.dispatchEvent(
      new CustomEvent("nav-request", {
        detail: path,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private renderNav(): TemplateResult {
    return html`
      <nav class="hidden items-center gap-1 md:flex">
        ${NAV_ITEMS.map(
          (item) => html`
            <button
              data-anim
              class="${this.activePath === item.path
                ? "bg-brand/10 font-medium text-brand"
                : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"} flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all duration-200"
              @click=${() => this.nav(item.path)}
            >
              ${unsafeHTML(`<span class="inline-flex opacity-70">${icon(item.icon, 14)}</span>`)}
              ${item.label}
            </button>
          `,
        )}
      </nav>
    `;
  }

  private renderUser(): TemplateResult {
    if (!this.loggedIn) {
      return html`
        <button
          data-anim
          class="bg-brand hover:bg-brand-hover hover:shadow-glow rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.03] active:scale-95"
          @click=${() => openAuthModal()}
        >
          Sign in
        </button>
      `;
    }
    const u = this.user;
    return html`
      <div class="relative" @click=${(e: Event) => e.stopPropagation()}>
        <button
          data-anim
          class="border-border hover:border-brand/40 hover:bg-surface-alt flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-all"
          @click=${() => (this.dropdownOpen = !this.dropdownOpen)}
        >
          ${u?.avatar
            ? html`<img
                src=${u.avatar}
                alt=""
                class="ring-brand/30 h-7 w-7 rounded-full object-cover ring-2"
              />`
            : html`<span
                class="bg-brand/15 text-brand flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
              >
                ${(u?.username || "?").charAt(0).toUpperCase()}
              </span>`}
          <span class="text-text-primary max-w-28 truncate">${u?.username}</span>
          ${unsafeHTML(
            `<span class="text-text-tertiary inline-flex transition-transform ${this.dropdownOpen ? "rotate-180" : ""}">${icon("chevronDown", 14)}</span>`,
          )}
        </button>
        ${this.dropdownOpen
          ? html`<div
              class="animate-scale-in border-border bg-surface absolute top-full right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border shadow-xl"
              ${ref(this.popRef)}
            >
              <div class="border-border bg-surface-alt border-b px-4 py-2.5">
                <p class="text-text-primary truncate text-sm font-medium">${u?.username}</p>
                <p class="text-text-tertiary truncate text-xs">${u?.email}</p>
              </div>
              <button
                class="text-text-secondary hover:bg-danger-light hover:text-danger flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors"
                @click=${() => {
                  this.dropdownOpen = false;
                  useAuthStore.getState().logout();
                }}
              >
                ${unsafeHTML(`<span class="inline-flex">${icon("logout", 14)}</span>`)} Sign out
              </button>
            </div>`
          : nothing}
      </div>
    `;
  }

  protected override render(): TemplateResult {
    return html`
      <header
        class="bg-surface/75 border-border sticky top-0 z-40 border-b backdrop-blur-xl backdrop-saturate-150"
      >
        <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div class="flex items-center gap-8">
            <button
              data-anim
              class="flex items-center gap-0.5 text-lg font-semibold tracking-tight"
              @click=${() => this.nav("/plaza")}
            >
              Chart<span class="text-brand">js</span>
            </button>
            ${this.renderNav()}
          </div>
          ${this.renderUser()}
        </div>
      </header>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "wc-header": WcHeader;
  }
}

import { customElement, property, state } from "lit/decorators.js";
import type { TemplateResult } from "lit";
import { WcElement, html, nothing } from "@/components/base";
import {
  listProjectsApi,
  getProjectDetailApi,
  createProjectApi,
  cloneChartApi,
  type ProjectSummary,
  type ChartItem,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { openAuthModal } from "@/lib/ui";
import { effect } from "@lark.js/larky";
import { icon } from "@/lib/icons";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { animateIn, animatePop } from "@/lib/anim";
import { ref, createRef } from "lit/directives/ref.js";

@customElement("wc-projects-page")
export class WcProjectsPage extends WcElement {
  @property() activePath = "";

  @state() private loggedIn = false;
  @state() private projects: ProjectSummary[] = [];
  @state() private current: ProjectSummary | null = null;
  @state() private charts: ChartItem[] = [];
  @state() private loading = true;
  @state() private showNewDialog = false;
  @state() private dialogName = "";
  @state() private showCloneDialog = false;
  @state() private cloneChartId = 0;
  @state() private cloneTargetId = "";
  @state() private creating = false;

  private dialogRef = createRef<HTMLElement>();
  private popAnimated = false;
  private offAuth?: () => void;

  override connectedCallback(): void {
    super.connectedCallback();
    this.loggedIn = useAuthStore.getState().loggedIn;
    if (this.loggedIn) this.loadProjects();
    this.offAuth = effect(() => {
      const { loggedIn } = useAuthStore.getState();
      if (loggedIn !== this.loggedIn) {
        this.loggedIn = loggedIn;
        if (loggedIn) this.loadProjects();
      }
    });
  }

  override disconnectedCallback(): void {
    this.offAuth?.();
    super.disconnectedCallback();
  }

  private nav(path: string): void {
    this.dispatchEvent(
      new CustomEvent("nav-request", {
        detail: path,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private loadCharts(projectId: number): void {
    getProjectDetailApi(projectId).then((res) => {
      if (res.ok && res.data) {
        this.charts = res.data.charts;
        this.requestUpdate();
        queueMicrotask(() => {
          if (this.isConnected) animateIn(this, "[data-anim-card]", { y: 20, stagger: 0.04 });
        });
      }
    });
  }

  private selectProject(project: ProjectSummary): void {
    this.current = project;
    this.charts = [];
    this.nav(`/projects?projectId=${project.id}`);
    this.loadCharts(project.id);
  }

  private loadProjects(): void {
    this.loading = true;
    listProjectsApi()
      .then((res) => {
        if (res.ok && res.data) {
          const list = res.data.projects;
          this.projects = list;
          if (list.length && !this.current) {
            this.selectProject(list[0]);
          }
        }
        this.loading = false;
      })
      .catch(() => (this.loading = false));
  }

  private createProject(): void {
    const name = this.dialogName.trim();
    if (!name || this.creating) return;
    this.creating = true;
    createProjectApi({ name }).then((res) => {
      this.creating = false;
      if (res.ok) {
        this.showNewDialog = false;
        this.dialogName = "";
        this.loadProjects();
      }
    });
  }

  private doClone(): void {
    const chartId = this.cloneChartId;
    const targetProjectId = Number(this.cloneTargetId);
    if (!chartId || !targetProjectId) return;
    cloneChartApi({ chartId, targetProjectId }).then((res) => {
      if (res.ok) {
        this.showCloneDialog = false;
        if (this.current && targetProjectId === this.current.id) {
          this.loadCharts(targetProjectId);
        }
      }
    });
  }

  private dialog(
    title: string,
    body: TemplateResult,
    onClose: () => void,
    onConfirm: () => void,
    confirmLabel: string,
    busy = false,
  ): TemplateResult {
    return html`
      <div
        class="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        @click=${onClose}
      >
        <div
          class="border-border bg-surface shadow-modal animate-scale-in w-full max-w-sm rounded-2xl border"
          @click=${(e: Event) => e.stopPropagation()}
          ${ref(this.dialogRef)}
        >
          <div class="p-6">
            <h3 class="text-text-primary mb-4 text-lg font-medium">${title}</h3>
            ${body}
            <div class="mt-5 flex justify-end gap-2">
              <button
                class="text-text-secondary hover:bg-surface-alt rounded-md px-4 py-2 text-sm transition-colors"
                @click=${onClose}
              >
                Cancel
              </button>
              <button
                class="hover:shadow-glow rounded-md px-4 py-2 text-sm font-medium text-white transition-all disabled:opacity-50"
                ?disabled=${busy}
                @click=${onConfirm}
              >
                ${busy ? "..." : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderSidebar(): TemplateResult {
    return html`
      <aside class="w-56 shrink-0">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-text-tertiary text-xs font-semibold tracking-widest uppercase">
            Projects
          </h2>
          <button
            class="text-text-secondary hover:bg-surface-alt hover:text-brand flex h-6 w-6 items-center justify-center rounded-md transition-colors"
            title="New project"
            @click=${() => {
              this.dialogName = "";
              this.showNewDialog = true;
            }}
          >
            ${unsafeHTML(icon("plus", 14))}
          </button>
        </div>

        ${this.loading
          ? html`<div class="space-y-2">
              ${[1, 2, 3].map(
                () => html`<div class="bg-surface-alt h-9 animate-pulse rounded-lg"></div>`,
              )}
            </div>`
          : html`
              <nav class="space-y-1">
                ${this.projects.map(
                  (item) => html`
                    <button
                      data-anim
                      class="${this.current && this.current.id === item.id
                        ? "bg-brand/10 text-brand font-medium"
                        : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"} block w-full rounded-lg px-3 py-2 text-left text-sm transition-all duration-200"
                      @click=${() => this.selectProject(item)}
                    >
                      ${item.name}
                    </button>
                  `,
                )}
              </nav>
              ${this.projects.length === 0
                ? html`<p class="text-text-tertiary mt-4 text-sm">
                    No projects yet. Create one to get started.
                  </p>`
                : nothing}
            `}
      </aside>
    `;
  }

  private renderChartCard(item: ChartItem): TemplateResult {
    return html`
      <div
        data-anim-card
        class="group border-border bg-surface hover:shadow-card-hover relative overflow-hidden rounded-xl border transition-all duration-300 hover:-translate-y-0.5"
      >
        <div class="bg-surface-alt flex h-32 items-center justify-center p-3">
          ${item.previewUrl
            ? html`<img
                src=${item.previewUrl}
                alt=${item.name || ""}
                class="max-h-full max-w-full object-contain"
              />`
            : html`<span class="text-text-tertiary/50">${unsafeHTML(icon("image", 32))}</span>`}
        </div>
        <div class="border-border flex items-center justify-between border-t px-3 py-2">
          <span class="text-text-primary truncate text-sm"> ${item.name} </span>
          <div class="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              class="text-text-secondary hover:text-brand rounded p-1 transition-colors"
              title="Edit"
              @click=${() => {
                if (this.current) {
                  this.nav(
                    `/editor?chartId=${item.id}&projectId=${this.current.id}&mode=${item.mode || "develop"}`,
                  );
                }
              }}
            >
              ${unsafeHTML(icon("pencil", 14))}
            </button>
            <button
              class="text-text-secondary hover:text-brand rounded p-1 transition-colors"
              title="Clone to project"
              @click=${() => {
                this.cloneChartId = item.id;
                this.cloneTargetId = this.current ? String(this.current.id) : "";
                this.showCloneDialog = true;
              }}
            >
              ${unsafeHTML(icon("copy", 14))}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  protected override updated(): void {
    const dialogOpen = this.showNewDialog || this.showCloneDialog;
    if (dialogOpen && !this.popAnimated && this.dialogRef.value) {
      this.popAnimated = true;
      animatePop(this.dialogRef.value);
    }
    if (!dialogOpen) this.popAnimated = false;
  }

  protected override render(): TemplateResult {
    if (!this.loggedIn) {
      return html`
        <div class="mx-auto max-w-7xl px-6 py-8">
          <div
            class="border-border flex h-72 flex-col items-center justify-center rounded-2xl border border-dashed"
          >
            ${unsafeHTML(
              `<span class="text-text-tertiary/40 inline-flex">${icon("folder", 40)}</span>`,
            )}
            <p class="text-text-secondary mt-4 text-lg">Please sign in to manage projects</p>
            <button
              class="hover:shadow-glow bg-brand mt-4 rounded-md px-5 py-2 text-sm font-medium text-white transition-all"
              @click=${() => openAuthModal()}
            >
              Sign in
            </button>
          </div>
        </div>
      `;
    }

    return html`
      <div class="mx-auto max-w-7xl px-6 py-8">
        <div class="flex gap-8">
          ${this.renderSidebar()}

          <main class="min-w-0 flex-1">
            ${this.current
              ? html`
                  <div class="mb-6 flex items-center justify-between">
                    <div>
                      <h1 class="text-text-primary text-xl font-semibold">${this.current.name}</h1>
                      <p class="text-text-secondary mt-0.5 text-sm">${this.charts.length} charts</p>
                    </div>
                    <button
                      class="hover:shadow-glow flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02] active:scale-95"
                      @click=${() => this.nav(`/editor?projectId=${this.current!.id}&mode=develop`)}
                    >
                      ${unsafeHTML(icon("plus", 14))} New Chart
                    </button>
                  </div>

                  ${this.charts.length > 0
                    ? html`<div class="grid grid-cols-2 gap-4 lg:grid-cols-3">
                        ${this.charts.map((item) => this.renderChartCard(item))}
                      </div>`
                    : html`<div
                        class="border-border text-text-secondary flex h-48 flex-col items-center justify-center rounded-xl border border-dashed"
                      >
                        <p>No charts in this project</p>
                        <button
                          class="text-brand mt-2 text-sm hover:underline"
                          @click=${() =>
                            this.nav(`/editor?projectId=${this.current!.id}&mode=develop`)}
                        >
                          Create your first chart
                        </button>
                      </div>`}
                `
              : html`<div class="text-text-secondary flex h-64 items-center justify-center">
                  Select a project or create a new one
                </div>`}
          </main>
        </div>
      </div>

      ${this.showNewDialog
        ? this.dialog(
            "New Project",
            html`<input
              type="text"
              .value=${this.dialogName}
              placeholder="Project name"
              class="border-border bg-surface text-text-primary placeholder:text-text-tertiary/60 focus:border-brand focus:ring-brand/25 w-full rounded-lg border px-3 py-2 text-sm transition-all outline-none focus:ring-3"
              @input=${(e: InputEvent) => (this.dialogName = (e.target as HTMLInputElement).value)}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter") this.createProject();
              }}
            />`,
            () => (this.showNewDialog = false),
            () => this.createProject(),
            "Create",
            this.creating,
          )
        : nothing}
      ${this.showCloneDialog
        ? this.dialog(
            "Clone Chart",
            html`
              <p class="text-text-secondary mb-3 text-sm">
                Select the target project for this chart copy.
              </p>
              <select
                class="border-border bg-surface text-text-primary focus:border-brand focus:ring-brand/25 w-full rounded-lg border px-3 py-2 text-sm transition-all outline-none focus:ring-3"
                @change=${(e: Event) =>
                  (this.cloneTargetId = (e.target as HTMLSelectElement).value)}
              >
                ${this.projects.map(
                  (proj) => html`
                    <option value=${proj.id} ?selected=${this.cloneTargetId === String(proj.id)}>
                      ${proj.name}
                    </option>
                  `,
                )}
              </select>
            `,
            () => (this.showCloneDialog = false),
            () => this.doClone(),
            "Clone",
          )
        : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "wc-projects-page": WcProjectsPage;
  }
}

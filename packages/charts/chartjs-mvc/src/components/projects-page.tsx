import { useSignal, useRef, useSignalEffect, useRouter } from "@lark.js/mvc";
import { raw } from "@lark.js/mvc/jsx-runtime";
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
import { icon } from "@/lib/icons";
import { animateIn, animatePop } from "@/lib/anim";

export default function ProjectsPage() {
  const router = useRouter();
  const { loggedIn } = useAuthStore.getState();
  const projects = useSignal<ProjectSummary[]>([]);
  const current = useSignal<ProjectSummary | null>(null);
  const charts = useSignal<ChartItem[]>([]);
  const loading = useSignal(true);
  const showNewDialog = useSignal(false);
  const dialogName = useSignal("");
  const showCloneDialog = useSignal(false);
  const cloneChartId = useSignal(0);
  const cloneTargetId = useSignal("");
  const creating = useSignal(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const popAnimated = useRef(false);

  const loadCharts = (projectId: number) => {
    getProjectDetailApi(projectId).then((res) => {
      if (res.ok && res.data) {
        charts.value = res.data.charts;
        queueMicrotask(() => {
          if (rootRef.current)
            animateIn(rootRef.current, "[data-anim-card]", {
              y: 20,
              stagger: 0.04,
            });
        });
      }
    });
  };

  const selectProject = (project: ProjectSummary) => {
    current.value = project;
    charts.value = [];
    router.navigate(`/projects?projectId=${project.id}`);
    loadCharts(project.id);
  };

  const loadProjects = () => {
    loading.value = true;
    listProjectsApi()
      .then((res) => {
        if (res.ok && res.data) {
          const list = res.data.projects;
          projects.value = list;
          if (list.length && !current.value) {
            selectProject(list[0]);
          }
        }
        loading.value = false;
      })
      .catch(() => (loading.value = false));
  };

  useSignalEffect(() => {
    if (loggedIn) loadProjects();
  });

  useSignalEffect(() => {
    const dialogOpen = showNewDialog.value || showCloneDialog.value;
    if (dialogOpen && !popAnimated.current && dialogRef.current) {
      popAnimated.current = true;
      animatePop(dialogRef.current);
    }
    if (!dialogOpen) popAnimated.current = false;
  });

  const createProject = () => {
    const name = dialogName.value.trim();
    if (!name || creating.value) return;
    creating.value = true;
    createProjectApi({ name }).then((res) => {
      creating.value = false;
      if (res.ok) {
        showNewDialog.value = false;
        dialogName.value = "";
        loadProjects();
      }
    });
  };

  const doClone = () => {
    const chartId = cloneChartId.value;
    const targetProjectId = Number(cloneTargetId.value);
    if (!chartId || !targetProjectId) return;
    cloneChartApi({ chartId, targetProjectId }).then((res) => {
      if (res.ok) {
        showCloneDialog.value = false;
        if (current.value && targetProjectId === current.value.id) {
          loadCharts(targetProjectId);
        }
      }
    });
  };

  if (!loggedIn) {
    return (
      <div class="mx-auto max-w-7xl px-6 py-8">
        <div class="border-border flex h-72 flex-col items-center justify-center rounded-2xl border border-dashed">
          {raw(`<span class="text-text-tertiary/40 inline-flex">${icon("folder", 40)}</span>`)}
          <p class="text-text-secondary mt-4 text-lg">Please sign in to manage projects</p>
          <button
            class="hover:shadow-glow bg-brand mt-4 rounded-md px-5 py-2 text-sm font-medium text-white transition-all"
            onClick={() => openAuthModal()}
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} class="mx-auto max-w-7xl px-6 py-8">
      <div class="flex gap-8">
        <aside class="w-56 shrink-0">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-text-tertiary text-xs font-semibold tracking-widest uppercase">
              Projects
            </h2>
            <button
              class="text-text-secondary hover:bg-surface-alt hover:text-brand flex h-6 w-6 items-center justify-center rounded-md transition-colors"
              title="New project"
              onClick={() => {
                dialogName.value = "";
                showNewDialog.value = true;
              }}
            >
              {raw(icon("plus", 14))}
            </button>
          </div>

          {loading.value ? (
            <div class="space-y-2">
              {[1, 2, 3].map(() => (
                <div class="bg-surface-alt h-9 animate-pulse rounded-lg"></div>
              ))}
            </div>
          ) : (
            <>
              <nav class="space-y-1">
                {projects.value.map((item) => (
                  <button
                    data-anim
                    class={`${
                      current.value && current.value.id === item.id
                        ? "bg-brand/10 text-brand font-medium"
                        : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"
                    } block w-full rounded-lg px-3 py-2 text-left text-sm transition-all duration-200`}
                    onClick={() => selectProject(item)}
                  >
                    {item.name}
                  </button>
                ))}
              </nav>
              {projects.value.length === 0 && (
                <p class="text-text-tertiary mt-4 text-sm">
                  No projects yet. Create one to get started.
                </p>
              )}
            </>
          )}
        </aside>

        <main class="min-w-0 flex-1">
          {current.value ? (
            <>
              <div class="mb-6 flex items-center justify-between">
                <div>
                  <h1 class="text-text-primary text-xl font-semibold">{current.value.name}</h1>
                  <p class="text-text-secondary mt-0.5 text-sm">{charts.value.length} charts</p>
                </div>
                <button
                  class="hover:shadow-glow flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02] active:scale-95"
                  onClick={() =>
                    router.navigate(`/editor?projectId=${current.value!.id}&mode=develop`)
                  }
                >
                  {raw(icon("plus", 14))} New Chart
                </button>
              </div>

              {charts.value.length > 0 ? (
                <div class="grid grid-cols-2 gap-4 lg:grid-cols-3">
                  {charts.value.map((item) => (
                    <div
                      data-anim-card
                      class="group border-border bg-surface hover:shadow-card-hover relative overflow-hidden rounded-xl border transition-all duration-300 hover:-translate-y-0.5"
                    >
                      <div class="bg-surface-alt flex h-32 items-center justify-center p-3">
                        {item.previewUrl ? (
                          <img
                            src={item.previewUrl}
                            alt={item.name || ""}
                            class="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span class="text-text-tertiary/50">{raw(icon("image", 32))}</span>
                        )}
                      </div>
                      <div class="border-border flex items-center justify-between border-t px-3 py-2">
                        <span class="text-text-primary truncate text-sm">{item.name}</span>
                        <div class="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            class="text-text-secondary hover:text-brand rounded p-1 transition-colors"
                            title="Edit"
                            onClick={() => {
                              if (current.value) {
                                router.navigate(
                                  `/editor?chartId=${item.id}&projectId=${current.value.id}&mode=${item.mode || "develop"}`,
                                );
                              }
                            }}
                          >
                            {raw(icon("pencil", 14))}
                          </button>
                          <button
                            class="text-text-secondary hover:text-brand rounded p-1 transition-colors"
                            title="Clone to project"
                            onClick={() => {
                              cloneChartId.value = item.id;
                              cloneTargetId.value = current.value ? String(current.value.id) : "";
                              showCloneDialog.value = true;
                            }}
                          >
                            {raw(icon("copy", 14))}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div class="border-border text-text-secondary flex h-48 flex-col items-center justify-center rounded-xl border border-dashed">
                  <p>No charts in this project</p>
                  <button
                    class="text-brand mt-2 text-sm hover:underline"
                    onClick={() =>
                      router.navigate(`/editor?projectId=${current.value!.id}&mode=develop`)
                    }
                  >
                    Create your first chart
                  </button>
                </div>
              )}
            </>
          ) : (
            <div class="text-text-secondary flex h-64 items-center justify-center">
              Select a project or create a new one
            </div>
          )}
        </main>
      </div>

      {showNewDialog.value && (
        <div
          class="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => (showNewDialog.value = false)}
        >
          <div
            class="border-border bg-surface shadow-modal animate-scale-in w-full max-w-sm rounded-2xl border"
            onClick={(e: Event) => e.stopPropagation()}
            ref={dialogRef}
          >
            <div class="p-6">
              <h3 class="text-text-primary mb-4 text-lg font-medium">New Project</h3>
              <input
                type="text"
                value={dialogName.value}
                placeholder="Project name"
                class="border-border bg-surface text-text-primary placeholder:text-text-tertiary/60 focus:border-brand focus:ring-brand/25 w-full rounded-lg border px-3 py-2 text-sm transition-all outline-none focus:ring-3"
                onInput={(e: Event) => (dialogName.value = (e.target as HTMLInputElement).value)}
                onKeyDown={(e: Event) => {
                  if ((e as KeyboardEvent).key === "Enter") createProject();
                }}
              />
              <div class="mt-5 flex justify-end gap-2">
                <button
                  class="text-text-secondary hover:bg-surface-alt rounded-md px-4 py-2 text-sm transition-colors"
                  onClick={() => (showNewDialog.value = false)}
                >
                  Cancel
                </button>
                <button
                  class="hover:shadow-glow rounded-md px-4 py-2 text-sm font-medium text-white transition-all disabled:opacity-50"
                  disabled={creating.value}
                  onClick={createProject}
                >
                  {creating.value ? "..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCloneDialog.value && (
        <div
          class="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => (showCloneDialog.value = false)}
        >
          <div
            class="border-border bg-surface shadow-modal animate-scale-in w-full max-w-sm rounded-2xl border"
            onClick={(e: Event) => e.stopPropagation()}
            ref={dialogRef}
          >
            <div class="p-6">
              <h3 class="text-text-primary mb-4 text-lg font-medium">Clone Chart</h3>
              <p class="text-text-secondary mb-3 text-sm">
                Select the target project for this chart copy.
              </p>
              <select
                class="border-border bg-surface text-text-primary focus:border-brand focus:ring-brand/25 w-full rounded-lg border px-3 py-2 text-sm transition-all outline-none focus:ring-3"
                onChange={(e: Event) =>
                  (cloneTargetId.value = (e.target as HTMLSelectElement).value)
                }
              >
                {projects.value.map((proj) => (
                  <option value={proj.id} selected={cloneTargetId.value === String(proj.id)}>
                    {proj.name}
                  </option>
                ))}
              </select>
              <div class="mt-5 flex justify-end gap-2">
                <button
                  class="text-text-secondary hover:bg-surface-alt rounded-md px-4 py-2 text-sm transition-colors"
                  onClick={() => (showCloneDialog.value = false)}
                >
                  Cancel
                </button>
                <button
                  class="hover:shadow-glow rounded-md px-4 py-2 text-sm font-medium text-white transition-all"
                  onClick={doClone}
                >
                  Clone
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

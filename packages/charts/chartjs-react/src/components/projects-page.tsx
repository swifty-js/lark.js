import { useEffect, useRef, useState } from "@lark.js/react";
import { Icon } from "@/components/Icon";
import {
  listProjectsApi,
  getProjectDetailApi,
  createProjectApi,
  cloneChartApi,
  type ProjectSummary,
  type ChartItem,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useStore } from "@/lib/store";
import { openAuthModal } from "@/lib/ui";
import { animateIn, animatePop } from "@/lib/anim";
import type { Children } from "@lark.js/react";

/**
 * My Projects — project sidebar + chart grid with new-project and
 * clone-chart dialogs. Navigation to the editor is a `navigate` call.
 */
export default function ProjectsPage({ navigate }: { navigate: (to: string) => void }) {
  const { loggedIn } = useStore(useAuthStore);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [current, setCurrent] = useState<ProjectSummary | null>(null);
  const [charts, setCharts] = useState<ChartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [dialogName, setDialogName] = useState("");
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [cloneChartId, setCloneChartId] = useState(0);
  const [cloneTargetId, setCloneTargetId] = useState("");
  const [creating, setCreating] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const loadCharts = (projectId: number) => {
    getProjectDetailApi(projectId).then((res) => {
      if (res.ok && res.data) {
        setCharts(res.data.charts);
        requestAnimationFrame(() => {
          if (rootRef.current) {
            animateIn(rootRef.current, "[data-anim-card]", {
              y: 20,
              stagger: 0.04,
            });
          }
        });
      }
    });
  };

  const loadProjects = (autoSelect = false) => {
    setLoading(true);
    listProjectsApi()
      .then((res) => {
        if (res.ok && res.data) {
          const list = res.data.projects;
          setProjects(list);
          // Auto-select the first project on initial load only.
          if (autoSelect && list.length) {
            setCurrent(list[0]);
            navigate(`/projects?projectId=${list[0].id}`);
            loadCharts(list[0].id);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  // Load when auth lands (and on mount if already logged in).
  useEffect(() => {
    if (loggedIn) loadProjects(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  // Pop-in once per dialog-open.
  useEffect(() => {
    if ((showNewDialog || showCloneDialog) && dialogRef.current) {
      animatePop(dialogRef.current);
    }
  }, [showNewDialog, showCloneDialog]);

  const selectProject = (project: ProjectSummary) => {
    setCurrent(project);
    setCharts([]);
    navigate(`/projects?projectId=${project.id}`);
    loadCharts(project.id);
  };

  const createProject = () => {
    const name = dialogName.trim();
    if (!name || creating) return;
    setCreating(true);
    createProjectApi({ name }).then((res) => {
      setCreating(false);
      if (res.ok) {
        setShowNewDialog(false);
        setDialogName("");
        loadProjects(false);
      }
    });
  };

  const doClone = () => {
    const targetProjectId = Number(cloneTargetId);
    if (!cloneChartId || !targetProjectId) return;
    cloneChartApi({ chartId: cloneChartId, targetProjectId }).then((res) => {
      if (res.ok) {
        setShowCloneDialog(false);
        if (current && targetProjectId === current.id) {
          loadCharts(targetProjectId);
        }
      }
    });
  };

  const dialog = (
    title: string,
    body: Children,
    onClose: () => void,
    onConfirm: () => void,
    confirmLabel: string,
    busy = false,
  ) => (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="border-border bg-surface shadow-modal animate-scale-in w-full max-w-sm rounded-2xl border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 className="text-text-primary mb-4 text-lg font-medium">{title}</h3>
          {body}
          <div className="mt-5 flex justify-end gap-2">
            <button
              className="text-text-secondary hover:bg-surface-alt rounded-md px-4 py-2 text-sm transition-colors"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="hover:shadow-glow rounded-md px-4 py-2 text-sm font-medium text-white transition-all disabled:opacity-50"
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? "..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (!loggedIn) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="border-border flex h-72 flex-col items-center justify-center rounded-2xl border border-dashed">
          <Icon name="folder" size={40} className="text-text-tertiary/40" />
          <p className="text-text-secondary mt-4 text-lg">Please sign in to manage projects</p>
          <button
            className="hover:shadow-glow bg-brand mt-4 rounded-md px-5 py-2 text-sm font-medium text-white transition-all"
            onClick={() => openAuthModal()}
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={rootRef} className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex gap-8">
          <aside className="w-56 shrink-0">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-text-tertiary text-xs font-semibold tracking-widest uppercase">
                Projects
              </h2>
              <button
                className="text-text-secondary hover:bg-surface-alt hover:text-brand flex h-6 w-6 items-center justify-center rounded-md transition-colors"
                title="New project"
                onClick={() => {
                  setDialogName("");
                  setShowNewDialog(true);
                }}
              >
                <Icon name="plus" size={14} />
              </button>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-surface-alt h-9 animate-pulse rounded-lg"></div>
                ))}
              </div>
            ) : (
              <>
                <nav className="space-y-1">
                  {projects.map((item) => (
                    <button
                      key={item.id}
                      data-anim
                      className={`${
                        current && current.id === item.id
                          ? "bg-brand/10 text-brand font-medium"
                          : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"
                      } block w-full rounded-lg px-3 py-2 text-left text-sm transition-all duration-200`}
                      onClick={() => selectProject(item)}
                    >
                      {item.name}
                    </button>
                  ))}
                </nav>
                {projects.length === 0 && (
                  <p className="text-text-tertiary mt-4 text-sm">
                    No projects yet. Create one to get started.
                  </p>
                )}
              </>
            )}
          </aside>

          <main className="min-w-0 flex-1">
            {current ? (
              <>
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h1 className="text-text-primary text-xl font-semibold">{current.name}</h1>
                    <p className="text-text-secondary mt-0.5 text-sm">{charts.length} charts</p>
                  </div>
                  <button
                    className="hover:shadow-glow flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02] active:scale-95"
                    onClick={() => navigate(`/editor?projectId=${current.id}&mode=develop`)}
                  >
                    <Icon name="plus" size={14} /> New Chart
                  </button>
                </div>

                {charts.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                    {charts.map((item) => (
                      <div
                        key={item.id}
                        data-anim-card
                        className="group border-border bg-surface hover:shadow-card-hover relative overflow-hidden rounded-xl border transition-all duration-300 hover:-translate-y-0.5"
                      >
                        <div className="bg-surface-alt flex h-32 items-center justify-center p-3">
                          {item.previewUrl ? (
                            <img
                              src={item.previewUrl}
                              alt={item.name || ""}
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <span className="text-text-tertiary/50">
                              <Icon name="image" size={32} />
                            </span>
                          )}
                        </div>
                        <div className="border-border flex items-center justify-between border-t px-3 py-2">
                          <span className="text-text-primary truncate text-sm">{item.name}</span>
                          <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              className="text-text-secondary hover:text-brand rounded p-1 transition-colors"
                              title="Edit"
                              onClick={() =>
                                navigate(
                                  `/editor?chartId=${item.id}&projectId=${current.id}&mode=${item.mode || "develop"}`,
                                )
                              }
                            >
                              <Icon name="pencil" size={14} />
                            </button>
                            <button
                              className="text-text-secondary hover:text-brand rounded p-1 transition-colors"
                              title="Clone to project"
                              onClick={() => {
                                setCloneChartId(item.id);
                                setCloneTargetId(String(current.id));
                                setShowCloneDialog(true);
                              }}
                            >
                              <Icon name="copy" size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border-border text-text-secondary flex h-48 flex-col items-center justify-center rounded-xl border border-dashed">
                    <p>No charts in this project</p>
                    <button
                      className="text-brand mt-2 text-sm hover:underline"
                      onClick={() => navigate(`/editor?projectId=${current.id}&mode=develop`)}
                    >
                      Create your first chart
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-text-secondary flex h-64 items-center justify-center">
                Select a project or create a new one
              </div>
            )}
          </main>
        </div>
      </div>

      {showNewDialog &&
        dialog(
          "New Project",
          <input
            type="text"
            value={dialogName}
            placeholder="Project name"
            className="border-border bg-surface text-text-primary placeholder:text-text-tertiary/60 focus:border-brand focus:ring-brand/25 w-full rounded-lg border px-3 py-2 text-sm transition-all outline-none focus:ring-3"
            onInput={(e) => setDialogName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createProject();
            }}
          />,
          () => setShowNewDialog(false),
          createProject,
          "Create",
          creating,
        )}

      {showCloneDialog &&
        dialog(
          "Clone Chart",
          <>
            <p className="text-text-secondary mb-3 text-sm">
              Select the target project for this chart copy.
            </p>
            <select
              key={cloneChartId}
              value={cloneTargetId}
              className="border-border bg-surface text-text-primary focus:border-brand focus:ring-brand/25 w-full rounded-lg border px-3 py-2 text-sm transition-all outline-none focus:ring-3"
              onChange={(e) => setCloneTargetId(e.currentTarget.value)}
            >
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
            </select>
          </>,
          () => setShowCloneDialog(false),
          doClone,
          "Clone",
        )}
    </>
  );
}

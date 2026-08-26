import { http, HttpResponse } from "msw";
import { faker } from "@faker-js/faker";
import { MOCK_USER, mockProjects, mockCharts, chartsOfProject } from "./data";

const ok = (data?: unknown, message = "ok") => ({
  ok: true,
  message,
  data,
});
const fail = (message: string) => ({ ok: false, message });

/**
 * In-memory session flag so logout actually clears the auth state.
 * Persisted in sessionStorage: the logout flow does a full page reload
 * (`window.location.href = "/plaza"`), which re-evaluates this module —
 * a bare `let` would reset to `true` and silently re-login the user.
 */
const SESSION_KEY = "wc-mock-session";
let sessionActive = sessionStorage.getItem(SESSION_KEY) !== "off";

function setSession(active: boolean): void {
  sessionActive = active;
  sessionStorage.setItem(SESSION_KEY, active ? "on" : "off");
}

export const handlers = [
  // --- auth ---
  http.get("/api/auth/me", () =>
    sessionActive
      ? HttpResponse.json(ok(MOCK_USER))
      : HttpResponse.json(fail("Not authenticated")),
  ),

  http.post("/api/auth/login", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };
    if (!body.email || !body.password) {
      return HttpResponse.json(fail("Email and password are required"));
    }
    setSession(true);
    return HttpResponse.json(ok({ userId: MOCK_USER.id }, "Welcome back"));
  }),

  http.post("/api/auth/register", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };
    if (!body.email || !body.password) {
      return HttpResponse.json(fail("Email and password are required"));
    }
    setSession(true);
    return HttpResponse.json(ok({ userId: MOCK_USER.id }, "Account created"));
  }),

  http.post("/api/auth/logout", () => {
    setSession(false);
    return HttpResponse.json(ok());
  }),

  // --- projects ---
  http.get("/api/projects", () =>
    HttpResponse.json(ok({ projects: mockProjects, message: "ok" })),
  ),

  http.get("/api/projects/:id", ({ params }) => {
    const id = Number(params.id);
    const project = mockProjects.find((p) => p.id === id);
    if (!project) return HttpResponse.json(fail("Project not found"));
    return HttpResponse.json(
      ok({ project, charts: chartsOfProject(id), users: [MOCK_USER] }),
    );
  }),

  http.post("/api/projects/create", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const name = (body.name || "").trim();
    if (!name) return HttpResponse.json(fail("Project name is required"));
    const project = {
      id: mockProjects.length + 1,
      name,
      description: null,
      version: 1,
      type: "chart",
      status: "active",
      gmtCreate: new Date().toISOString(),
      gmtModified: new Date().toISOString(),
    };
    mockProjects.push(project);
    return HttpResponse.json(ok({ projectId: project.id }, "Created"));
  }),

  http.post("/api/projects/quit", () => HttpResponse.json(ok())),

  // --- charts ---
  http.get("/api/charts/home", () =>
    HttpResponse.json(ok({ charts: mockCharts.slice(0, 24) })),
  ),

  http.post("/api/charts/save", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      chartId?: number;
      name?: string;
    };
    const chartId = body.chartId ?? faker.number.int({ min: 100, max: 999 });
    return HttpResponse.json(ok({ chartId }, "Saved"));
  }),

  http.post("/api/charts/clone", () =>
    HttpResponse.json(
      ok(
        {
          chartId: faker.number.int({ min: 100, max: 999 }),
          projectChartId: faker.number.int({ min: 100, max: 999 }),
        },
        "Cloned",
      ),
    ),
  ),
];

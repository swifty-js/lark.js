const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  return res.json() as Promise<T>;
}

export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface Result<T = undefined> {
  ok: boolean;
  message: string;
  data?: T;
}

export interface UserInfo {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  permission: number;
}

export interface ProjectSummary {
  id: number;
  name: string;
  description: string | null;
  version: number;
  type: string;
  status: string | null;
  gmtCreate: string;
  gmtModified: string;
}

export interface ChartItem {
  id: number;
  name: string | null;
  previewUrl: string | null;
  chartType: string | null;
  chartOptions: string | null;
  chartData: unknown;
  dataType: string | null;
  mode: string | null;
  permission: number;
  projectId: number;
  projectChartId: number;
  description: string | null;
  gmtModified: string;
}

export interface ProjectDetail {
  project: ProjectSummary | null;
  charts: ChartItem[];
  users: UserInfo[];
}

export function authMeApi() {
  return apiFetch<Result<UserInfo>>("/api/auth/me");
}

export function loginApi(input: { email: string; password: string }) {
  return apiPost<Result<{ userId: number }>>("/api/auth/login", input);
}

export function registerApi(input: {
  email: string;
  password: string;
  username?: string;
}) {
  return apiPost<Result<{ userId: number }>>("/api/auth/register", input);
}

export function logoutApi() {
  return apiPost<Result>("/api/auth/logout", {});
}

export function listProjectsApi() {
  return apiFetch<Result<{ projects: ProjectSummary[]; message: string }>>(
    "/api/projects",
  );
}

export function getProjectDetailApi(projectId: number) {
  return apiFetch<Result<ProjectDetail>>(`/api/projects/${projectId}`);
}

export function createProjectApi(input: {
  name: string;
  description?: string;
  type?: string;
}) {
  return apiPost<Result<{ projectId: number }>>("/api/projects/create", input);
}

export function homeChartsApi() {
  return apiFetch<Result<{ charts: ChartItem[] }>>("/api/charts/home");
}

export interface SaveChartPayload {
  projectId: number;
  chartId?: number;
  name?: string;
  chartType?: string;
  chartOptions: string;
  chartData?: string;
  dataType?: string;
  permission?: number;
  mode?: string;
}

export function saveChartApi(payload: SaveChartPayload) {
  return apiPost<Result<{ chartId: number }>>("/api/charts/save", payload);
}

export function cloneChartApi(input: {
  chartId: number;
  targetProjectId: number;
}) {
  return apiPost<Result<{ chartId: number; projectChartId: number }>>(
    "/api/charts/clone",
    input,
  );
}

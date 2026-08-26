import { faker } from "@faker-js/faker";
import { genBase64 } from "./img";

export interface SessionUser {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
  permission: number;
}

export const MOCK_USER: SessionUser = {
  id: 1,
  username: "whoami",
  email: "whoami@chartjs.dev",
  avatar: genBase64("avatar-whoami"),
  permission: 2,
};

const CHART_TYPES = [
  "line",
  "bar",
  "hbar",
  "pie",
  "doughnut",
  "radar",
  "scatter",
  "bubble",
  "area",
  "polarArea",
] as const;

export interface MockChart {
  id: number;
  name: string;
  previewUrl: string;
  chartType: string;
  chartOptions: string | null;
  chartData: unknown;
  dataType: string;
  mode: string;
  permission: number;
  projectId: number;
  projectChartId: number;
  description: string | null;
  gmtModified: string;
}

export interface MockProject {
  id: number;
  name: string;
  description: string | null;
  version: number;
  type: string;
  status: string | null;
  gmtCreate: string;
  gmtModified: string;
}

export const mockProjects: MockProject[] = [
  "Analytics",
  "Infrastructure",
  "Growth",
  "Experimentation",
].map((name, i) => ({
  id: i + 1,
  name,
  description: faker.company.catchPhrase(),
  version: faker.number.int({ min: 1, max: 5 }),
  type: "chart",
  status: "active",
  gmtCreate: faker.date.recent({ days: 60 }).toISOString(),
  gmtModified: faker.date.recent({ days: 7 }).toISOString(),
}));

const chartName = (): string =>
  `${faker.word.adjective()} ${faker.word.noun()} ${faker.commerce.productName()}`.slice(0, 40);

export const mockCharts: MockChart[] = Array.from({ length: 36 }, (_, i) => ({
  id: i + 1,
  name: chartName(),
  previewUrl: genBase64(`chart-preview-${i + 1}`),
  chartType: faker.helpers.arrayElement(CHART_TYPES),
  chartOptions: null,
  chartData: null,
  dataType: "table",
  mode: faker.helpers.arrayElement(["develop", "view"]),
  permission: faker.number.int({ min: 0, max: 2 }),
  projectId: faker.number.int({ min: 1, max: 4 }),
  projectChartId: i + 1,
  description: faker.lorem.sentence(),
  gmtModified: faker.date.recent({ days: 30 }).toISOString(),
}));

export const chartsOfProject = (projectId: number): MockChart[] =>
  mockCharts.filter((c) => c.projectId === projectId);

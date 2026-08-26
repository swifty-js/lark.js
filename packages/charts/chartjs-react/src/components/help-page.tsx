import { useEffect, useRef, useRouter, useState } from "@lark.js/react";
import { Icon } from "@/components/Icon";
import { animateIn } from "@/lib/anim";
import type { IconName } from "@/lib/icons";

interface HelpSection {
  key: string;
  title: string;
  icon: IconName;
  paragraphs: string[];
  code?: string;
}

const SECTIONS: HelpSection[] = [
  {
    key: "start",
    title: "Getting Started",
    icon: "sparkles",
    paragraphs: [
      "chart.js is a chart management platform built for creating, organizing, and sharing data visualizations. Browse the Chart Plaza for community charts, create projects to organize your work, and use the built-in code editor to configure charts.",
      "To create your first chart: navigate to My Projects, create a new project (or select an existing one), then click New Chart. This opens the editor where you write chart configuration code and preview the result in real time.",
      "Charts in chart.js are powered by chart.js, a declarative charting library. You define an options object that describes the chart structure (type, data, scales) and chart.js renders it with your data.",
    ],
  },
  {
    key: "config",
    title: "Chart Configuration",
    icon: "code",
    paragraphs: [
      "Each chart is defined by a JavaScript code snippet that produces an options object. The editor evaluates your code with the chart data available as a data variable. Your code must define a top-level options variable.",
      "Use the visual tab to scaffold a chart type, then refine the generated code by hand. The code tab provides Monaco-powered editing with autocompletion for chart.js options.",
    ],
    code: [
      "var options = {",
      "    type: 'bar',",
      "    data: {",
      "        labels: data[0].slice(1),",
      "        datasets: [{",
      "            label: 'Revenue',",
      "            data: data.slice(1).map(row => row[1])",
      "        }]",
      "    }",
      "};",
    ].join("\n"),
  },
  {
    key: "data",
    title: "Working with Data",
    icon: "layers",
    paragraphs: [
      "The editor provides a Data tab where you can edit chart data in a spreadsheet-like grid. The first row defines column headers (field names), and subsequent rows are data records.",
      "Add rows and columns using the toolbar buttons. Remove them by hovering over the row number or column header and clicking the delete icon. Changes to the data grid are reflected when you click Run.",
      "Data is stored as a 2D array (array of rows). The first row is always the header row containing field names that your chart options reference.",
    ],
  },
  {
    key: "projects",
    title: "Projects and Organization",
    icon: "folder",
    paragraphs: [
      "Projects group related charts together. You can create multiple projects, each containing any number of charts. The projects page shows a sidebar with all your projects and a grid of charts for the selected project.",
      "Charts can be cloned to other projects using the clone button (appears on hover over a chart card). This is useful for creating variations or sharing work across projects.",
      "Each chart stores its configuration code, data, type, and preview image. When you save from the editor, all of these are persisted to the server.",
    ],
  },
  {
    key: "about",
    title: "About chart.js",
    icon: "globe",
    paragraphs: [
      "chart.js is an internal chart management platform designed for teams that need to create, iterate on, and share data visualizations. It provides a code-first approach to chart configuration while maintaining an accessible visual preview.",
      "The platform is built with lark-react (routing + UI), TailwindCSS, Monaco Editor, chart.js, and GSAP animations. It supports dark mode and responsive layouts.",
    ],
  },
];

export default function HelpPage() {
  const { navigate } = useRouter();
  const initial = new URLSearchParams(window.location.search).get("section") || "start";
  const [activeKey, setActiveKey] = useState(
    SECTIONS.find((s) => s.key === initial)?.key || SECTIONS[0].key,
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (rootRef.current) {
      animateIn(rootRef.current, "[data-anim]", { y: 14, stagger: 0.05 });
    }
  }, []);

  const selectSection = (key: string) => {
    setActiveKey(key);
    navigate(`/help?section=${key}`);
  };

  const current = SECTIONS.find((s) => s.key === activeKey) || SECTIONS[0];

  return (
    <div ref={rootRef} className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-text-primary text-2xl font-semibold">Help</h1>
        <p className="text-text-secondary mt-1 text-sm">Learn how to use chart.js</p>
      </div>

      <div className="flex gap-10">
        <aside className="w-48 shrink-0">
          <nav className="sticky top-20 space-y-1">
            {SECTIONS.map((item) => (
              <button
                key={item.key}
                data-anim
                className={`${
                  activeKey === item.key
                    ? "bg-brand/10 text-brand font-medium"
                    : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"
                } flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all duration-200`}
                onClick={() => selectSection(item.key)}
              >
                <Icon name={item.icon} size={14} className="shrink-0 opacity-70" />
                {item.title}
              </button>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 flex-1">
          <h2 className="text-text-primary animate-slide-up text-xl font-semibold">
            {current.title}
          </h2>

          <div className="mt-5 space-y-4">
            {current.paragraphs.map((para, i) => (
              <p key={i} className="text-text-secondary animate-slide-up text-sm leading-relaxed">
                {para}
              </p>
            ))}
          </div>

          {current.code && (
            <div className="border-border animate-scale-in mt-6 overflow-hidden rounded-xl border">
              <div className="border-border bg-surface-alt flex items-center gap-2 border-b px-4 py-2">
                <Icon name="code" size={13} className="text-brand/70" />
                <span className="text-text-secondary text-xs font-medium">Example</span>
              </div>
              <pre className="bg-code-bg text-text-primary overflow-x-auto p-4 text-xs leading-relaxed">
                <code>{current.code}</code>
              </pre>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

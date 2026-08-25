// @vitest-environment jsdom
/**
 * Repro for the consumer-reported bug: clicking a header nav link calls
 * router.navigate(href) — the URL changes but the view never swaps and the
 * page hard-freezes (no console error). Mirrors the mm-node-nextjs app shape:
 * RootLayout(header nav + <RouterView router/>) with pages that use
 * useSignal/useComputed/useEffect and a module-level auth signal read via a
 * per-render computed().
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  render,
  unmount,
  createRouter,
  RouterView,
  useRouter,
  useSignal,
  useComputed,
  useEffect,
  signal,
  computed,
  nextTick,
  type RouterApi,
} from "../src/index";

// ---- module-level auth store (mirrors auth-store.ts) ----
const user = signal<{ name: string } | null>(null);
function useAuth() {
  return { user: computed(() => user.value) };
}

function SiteHeader() {
  const { user: u } = useAuth();
  const router = useRouter();
  const open = useSignal(false);
  return (
    <header>
      <nav>
        {["/", "/projects", "/editor"].map((href) => (
          <a
            key={href}
            href={href}
            onClick={(e) => {
              e.preventDefault();
              void router.navigate(href);
            }}
          >
            {href}
          </a>
        ))}
      </nav>
      {u.value ? (
        <span>{u.value.name}</span>
      ) : (
        <button onClick={() => (open.value = true)}>Sign In</button>
      )}
    </header>
  );
}

function HomePage() {
  const charts = useSignal<{ id: number; type: string }[]>([]);
  const active = useSignal("all");
  const loading = useSignal(true);
  useEffect(() => {
    void Promise.resolve().then(() => {
      charts.value = [
        { id: 1, type: "bar" },
        { id: 2, type: "line" },
      ];
      loading.value = false;
    });
  });
  const groups = useComputed(() => {
    const map = new Map<string, number>();
    for (const c of charts.value) map.set(c.type, (map.get(c.type) ?? 0) + 1);
    return Array.from(map.entries());
  });
  return (
    <div id="home">
      {loading.value ? (
        <p>loading</p>
      ) : (
        <>
          <button onClick={() => (active.value = "all")}>All</button>
          {groups.value.map(([type, n]) => (
            <span key={type}>
              {type}:{n}
            </span>
          ))}
          {charts.value.map((c) => (
            <div key={c.id}>chart {c.id}</div>
          ))}
        </>
      )}
    </div>
  );
}

function ProjectsPage() {
  const router = useRouter();
  const { user: u } = useAuth();
  const projects = useSignal<number[]>([]);
  const loading = useSignal(true);
  const routeId = router.params.value["id"];
  useEffect(() => {
    void Promise.resolve().then(() => {
      projects.value = [11, 22];
      loading.value = false;
      if (!routeId) void router.navigate("/projects/11");
    });
  });
  if (!u.value) return <div id="projects">please sign in</div>;
  return (
    <div id="projects">
      projects {routeId ?? "none"} ({projects.value.length}) {String(loading.value)}
    </div>
  );
}

function EditorPage() {
  return <div id="editor">editor</div>;
}

function RootLayout(props: { router: RouterApi }) {
  const pathname = window.location.pathname;
  return (
    <div class={pathname.startsWith("/editor") ? "h-dvh" : "min-h-dvh"}>
      <SiteHeader />
      <main id="main">
        <RouterView router={props.router} />
      </main>
      <footer>ChartPark</footer>
    </div>
  );
}

describe("app-shaped navigation", () => {
  let container: Element;

  beforeEach(() => {
    history.replaceState(null, "", "/");
    document.body.innerHTML = '<div id="root"></div>';
    container = document.getElementById("root")!;
    user.value = null;
  });

  it("nav click swaps the routed page without freezing", async () => {
    const router = createRouter([
      { path: "/", component: HomePage },
      { path: "/projects", component: ProjectsPage },
      { path: "/projects/:id", component: ProjectsPage },
      { path: "/editor", component: EditorPage },
    ]);
    render(<RootLayout router={router} />, container);
    expect(container.querySelector("#home")).toBeTruthy();

    await nextTick(); // home data lands
    await nextTick();
    expect(container.textContent).toContain("chart 1");

    // click "/projects" in the header nav
    const links = Array.from(container.querySelectorAll("a"));
    const projectsLink = links.find((a) => a.getAttribute("href") === "/projects")!;
    projectsLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    await nextTick();
    expect(location.pathname.startsWith("/projects")).toBe(true);
    expect(container.querySelector("#home")).toBeNull();
    expect(container.querySelector("#projects")).toBeTruthy();

    // effect redirect to /projects/11 lands on later ticks
    user.value = { name: "u1" };
    await nextTick();
    await nextTick();
    await nextTick();
    expect(location.pathname).toBe("/projects/11");
    expect(container.textContent).toContain("projects 11");

    // then to editor
    const editorLink = links.find((a) => a.getAttribute("href") === "/editor")!;
    editorLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await nextTick();
    expect(container.querySelector("#editor")).toBeTruthy();

    unmount(container);
    router.dispose();
  });
});

import { useEffect, useRef } from "@lark.js/react";
import { Icon } from "@/components/Icon";
import { animateIn } from "@/lib/anim";

export default function NotFoundPage({ navigate }: { navigate: (to: string) => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (rootRef.current) {
      animateIn(rootRef.current, "[data-anim]", { y: 16, stagger: 0.08 });
    }
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative flex min-h-[70vh] flex-col items-center justify-center px-6 text-center"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] mask-[radial-gradient(ellipse_80%_60%_at_50%_0%,black_30%,transparent_75%)] bg-size-[32px_32px] opacity-50"></div>
      <p data-anim className="text-brand text-8xl font-bold tracking-tighter">
        404
      </p>
      <h1 data-anim className="text-text-primary mt-4 text-xl font-medium">
        Page not found
      </h1>
      <p data-anim className="text-text-secondary mt-2 text-sm">
        The page you are looking for does not exist.
      </p>
      <button
        data-anim
        className="hover:shadow-glow mt-6 flex items-center gap-1.5 rounded-md px-5 py-2 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02] active:scale-95"
        onClick={() => navigate("/plaza")}
      >
        <Icon name="arrowRight" size={14} /> Back to Chart Plaza
      </button>
    </div>
  );
}

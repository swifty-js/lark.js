import { Icon } from "@/components/Icon";

export default function Footer() {
  return (
    <footer className="border-border bg-surface-alt/40 border-t">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <Icon name="chartBar" size={16} className="text-brand/60" />
          <p className="text-text-tertiary text-sm">chart.js</p>
        </div>
        <p className="text-text-tertiary text-xs">Crafted with lark-react · chart.js · GSAP</p>
      </div>
    </footer>
  );
}

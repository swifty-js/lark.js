import { raw } from "@lark.js/mvc/jsx-runtime";
import { icon } from "@/lib/icons";

export default function Footer() {
  return (
    <footer class="border-border bg-surface-alt/40 border-t">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div class="flex items-center gap-2">
          {raw(`<span class="text-brand/60 inline-flex">${icon("chartBar", 16)}</span>`)}
          <p class="text-text-tertiary text-sm">chart.js</p>
        </div>
        <p class="text-text-tertiary text-xs">Crafted with lark-mvc · chart.js · GSAP</p>
      </div>
    </footer>
  );
}

import { raw } from "@lark.js/larky";
import { icon } from "@/lib/icons";

export default function Footer() {
  return (
    <footer class="border-border bg-surface-alt/40 border-t">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div class="flex items-center gap-2">
          <span class="text-brand/60 inline-flex">{raw(icon("chartBar", 16))}</span>
          <p class="text-text-tertiary text-sm">chart.js</p>
        </div>
        <p class="text-text-tertiary text-xs">Crafted with larky · chart.js · GSAP</p>
      </div>
    </footer>
  );
}

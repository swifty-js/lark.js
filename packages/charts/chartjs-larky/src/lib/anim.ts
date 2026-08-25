import gsap from "gsap";

export function animateIn(
  root: HTMLElement,
  selector = "[data-anim]",
  opts: {
    y?: number;
    duration?: number;
    stagger?: number;
    delay?: number;
  } = {},
): void {
  const targets = root.querySelectorAll<HTMLElement>(selector);
  if (!targets.length) return;
  gsap.fromTo(
    targets,
    { opacity: 0, y: opts.y ?? 18 },
    {
      opacity: 1,
      y: 0,
      duration: opts.duration ?? 0.55,
      stagger: opts.stagger ?? 0.05,
      delay: opts.delay ?? 0,
      ease: "power3.out",
      overwrite: "auto",
      clearProps: "opacity,transform",
    },
  );
}

export function animatePop(el: HTMLElement): void {
  gsap.fromTo(
    el,
    { opacity: 0, scale: 0.94, y: 12 },
    {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: 0.4,
      ease: "back.out(1.6)",
      overwrite: "auto",
    },
  );
}

export function animateCount(el: HTMLElement, from: number, to: number, duration = 0.8): void {
  const state = { v: from };
  gsap.to(state, {
    v: to,
    duration,
    ease: "power2.out",
    overwrite: "auto",
    onUpdate() {
      el.textContent = String(Math.round(state.v));
    },
  });
}

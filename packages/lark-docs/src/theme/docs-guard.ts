/**
 * Copyright (c) 2026 hangtiancheng
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Built-in password guard for protected pages (docsGuardPlugin).
 *
 * `createContentGuard(loadContent)` wraps the generated `loadContent` so that
 * pages encrypted at build time by `docsGuardPlugin` (frontmatter
 * `protected: true` + `DOCS_PASSWORD` env) prompt for a password before
 * rendering. Unlike the React implementation, the dialog here is a plain
 * imperative DOM overlay — no component to mount; just pass the wrapped
 * loader into State:
 *
 * ```ts
 * const guard = createContentGuard(loadContent);
 * State.set({ docsConfig, loadContent: guard.loadContent, getSearchIndex });
 * ```
 *
 * NOTE: this module is imported from the main package entry, which is also
 * evaluated in Node during builds/tests — nothing at module top level may
 * touch `document`.
 */
import { z } from "zod";
import lockSvg from "lucide-static/icons/lock.svg?raw";
import xSvg from "lucide-static/icons/x.svg?raw";
import { decryptContent, type EncryptedPayload } from "../utils/guard";

const SESSION_KEY = "docs-guard-pwd";

// Rendered in place of the page body when the visitor cancels the prompt.
// Visual parity with the React version (centered lock + Access Denied).
const DENIED_HTML =
  '<div class="flex min-h-[45vh] flex-col items-center justify-center gap-4 text-center">' +
  '<div aria-hidden="true" class="text-foreground opacity-35 [&>svg]:size-13 [&>svg]:stroke-[1.2]">' +
  lockSvg +
  "</div>" +
  "<div>" +
  '<p class="mb-1.5 text-lg font-bold">Access Denied</p>' +
  '<p class="text-sm opacity-55">This page is password-protected. Enter the correct password to view its content.</p>' +
  "</div>" +
  "</div>";

const EncryptedPayloadSchema = z.object({
  encrypted: z.string(),
  authTag: z.string(),
  salt: z.string(),
  iv: z.string(),
});

function parsePayload(html: string): EncryptedPayload | null {
  try {
    const parsed = EncryptedPayloadSchema.safeParse(JSON.parse(html));
    if (parsed.success) return parsed.data;
  } catch {
    // Not an encrypted payload — plain page HTML.
  }
  return null;
}

const PageHeadingSchema = z.looseObject({
  level: z.number(),
  text: z.string(),
  slug: z.string(),
});

// Malformed headings degrade to an empty Toc rather than failing the whole
// envelope (which would render the raw JSON as page HTML).
const DecryptedPageSchema = z.object({
  html: z.string(),
  headings: z.array(PageHeadingSchema).catch([]),
});

interface DecryptedPage {
  html: string;
  headings?: z.infer<typeof PageHeadingSchema>[];
}

/**
 * The build-time plugin encrypts a `{ html, headings }` envelope so the Toc
 * survives the pageData scrub. Payloads produced by older builds contain the
 * raw HTML string; treat those as an envelope without headings.
 */
function parseDecrypted(plaintext: string): DecryptedPage {
  try {
    const parsed = DecryptedPageSchema.safeParse(JSON.parse(plaintext));
    if (parsed.success) return parsed.data;
  } catch {
    // Legacy payload — plain HTML string.
  }
  return { html: plaintext };
}

function shakeElement(el: HTMLElement) {
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(3px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 400, easing: "ease-in-out" },
  );
}

interface Unlock {
  plaintext: string;
  password: string;
}

interface DialogHandle {
  /** Force-deny and tear down the dialog (used when superseded). */
  deny(): void;
}

/**
 * Imperative password dialog: overlay + card appended to document.body.
 * Enter / button submits, Esc / close button / outside click cancels.
 * Settles exactly once via `settle(unlock | null)` and removes itself.
 */
function openPasswordDialog(
  payload: EncryptedPayload,
  settle: (unlock: Unlock | null) => void,
): DialogHandle {
  let settled = false;
  let checking = false;

  const overlay = document.createElement("div");
  overlay.className =
    "animate-overlay-in bg-background/60 fixed inset-0 z-999 backdrop-blur-[6px]";

  const wrapper = document.createElement("div");
  wrapper.className = "fixed inset-0 z-999 grid place-items-center p-4";

  const card = document.createElement("div");
  card.className =
    "animate-dialog-in bg-background text-foreground border-muted relative w-full max-w-sm rounded-xl border p-8 shadow-lg";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "Password Required");
  card.innerHTML =
    '<form class="flex flex-col">' +
    '<button type="button" aria-label="Close" data-guard-close class="text-muted-foreground hover:bg-muted absolute top-3 right-3 flex size-7 items-center justify-center rounded-md opacity-60 transition-all duration-150 hover:opacity-100"><span aria-hidden="true" class="size-3.75 [&>svg]:size-full">' +
    xSvg +
    "</span></button>" +
    '<div class="border-muted bg-accent text-primary mb-5 flex size-12 items-center justify-center rounded-lg border"><span aria-hidden="true" class="size-6 [&>svg]:size-full [&>svg]:stroke-[1.5]">' +
    lockSvg +
    "</span></div>" +
    '<h2 class="text-[1.05rem] font-bold tracking-tight">Password Required</h2>' +
    '<p class="text-muted-foreground mt-1 mb-5 text-[0.82rem]">This page is protected. Enter the password to view its content.</p>' +
    '<input type="password" placeholder="Password" data-guard-input class="border-muted bg-background focus-visible:border-primary w-full rounded-md border px-3 py-2.5 text-sm outline-none" />' +
    '<p data-guard-error class="text-destructive mt-2 hidden text-[0.78rem] font-medium"></p>' +
    '<button type="submit" data-guard-submit class="bg-primary text-primary-foreground hover:bg-primary/90 mt-5 w-full rounded-md px-4 py-2.5 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50">Unlock</button>' +
    "</form>";

  wrapper.appendChild(card);
  document.body.appendChild(overlay);
  document.body.appendChild(wrapper);

  // The static markup above guarantees these queries succeed.
  const form = card.querySelector("form")!;
  const input = card.querySelector<HTMLInputElement>("[data-guard-input]")!;
  const errorEl = card.querySelector<HTMLElement>("[data-guard-error]")!;
  const submitBtn = card.querySelector<HTMLButtonElement>(
    "[data-guard-submit]",
  )!;
  const closeBtn = card.querySelector<HTMLButtonElement>("[data-guard-close]")!;

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      finish(null);
    }
  };

  function finish(unlock: Unlock | null): void {
    if (settled) return;
    settled = true;
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
    wrapper.remove();
    settle(unlock);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = input.value;
    if (!value.trim() || checking || settled) return;
    checking = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Verifying...";
    decryptContent(payload, value)
      .then((plaintext) => finish({ plaintext, password: value }))
      .catch(() => {
        errorEl.textContent = "Incorrect password, please try again.";
        errorEl.classList.remove("hidden");
        input.classList.add("border-destructive");
        shakeElement(card);
        checking = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "Unlock";
        input.select();
      });
  });

  input.addEventListener("input", () => {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
    input.classList.remove("border-destructive");
  });

  closeBtn.addEventListener("click", () => finish(null));
  // Radix-style outside click: the wrapper covers the viewport, the card
  // stops propagation by virtue of being the click target's ancestor.
  wrapper.addEventListener("click", (e) => {
    if (e.target === wrapper) finish(null);
  });
  document.addEventListener("keydown", onKeydown);
  input.focus();

  return { deny: () => finish(null) };
}

export interface ContentGuard<
  T extends { contentHtml: string; pageData?: { headings?: unknown } },
> {
  /** Drop-in replacement for the generated `loadContent`. */
  loadContent: (path: string) => Promise<T | null>;
}

export function createContentGuard<
  T extends { contentHtml: string; pageData?: { headings?: unknown } },
>(loadContent: (path: string) => Promise<T | null>): ContentGuard<T> {
  let active: DialogHandle | null = null;

  const ask = (payload: EncryptedPayload): Promise<Unlock | null> => {
    // A newer request supersedes a pending one: deny the old request
    // instead of leaving its loadContent promise hanging.
    active?.deny();
    return new Promise((resolve) => {
      const handle = openPasswordDialog(payload, (unlock) => {
        if (active === handle) active = null;
        resolve(unlock);
      });
      active = handle;
    });
  };

  const unlockPage = (mod: T, plaintext: string): T => {
    const page = parseDecrypted(plaintext);
    const unlocked: T = { ...mod, contentHtml: page.html };
    if (page.headings && unlocked.pageData) {
      unlocked.pageData = {
        ...unlocked.pageData,
        headings: page.headings,
      } as T["pageData"];
    }
    return unlocked;
  };

  const guardedLoadContent = async (path: string): Promise<T | null> => {
    const mod = await loadContent(path);
    if (!mod) return null;

    const payload = parsePayload(mod.contentHtml);
    if (!payload) return mod;

    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) {
      try {
        const plaintext = await decryptContent(payload, cached);
        return unlockPage(mod, plaintext);
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }

    // No DOM (SSR / node) — cannot prompt, treat as denied.
    const unlock = typeof document === "undefined" ? null : await ask(payload);
    if (unlock === null) return { ...mod, contentHtml: DENIED_HTML };

    sessionStorage.setItem(SESSION_KEY, unlock.password);
    return unlockPage(mod, unlock.plaintext);
  };

  return { loadContent: guardedLoadContent };
}

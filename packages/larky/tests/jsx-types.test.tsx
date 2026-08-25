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
 * Compile-time assertions for the full per-tag JSX DOM type layer.
 *
 * The `@ts-expect-error` directives are enforced by `pnpm typecheck`
 * (tsc covers tests/) — an accepted-but-should-fail usage turns into an
 * "Unused '@ts-expect-error' directive" build error. Vitest itself runs
 * transpile-only, so the runtime test at the bottom just mounts the valid
 * elements once.
 */

import { render, unmount, signal, useRef, type FC, type JSXNode } from "@lark.js/larky";
import { createContainer } from "./helpers";

function expectType<T>(value: T): T {
  return value;
}

// ============================================================
// Valid usages — must compile
// ============================================================

function ValidElements(): JSXNode {
  const cls = signal("box");
  const href = signal<string | undefined>("/docs");
  const inputRef = useRef<HTMLInputElement>();
  return (
    <div class={cls} data-testid="root" aria-hidden={false} tabindex={0}>
      {/* per-tag attributes + Signalish values */}
      <a href={href} target="_blank" referrerpolicy="no-referrer">
        docs
      </a>
      <button
        type="button"
        disabled={false}
        onClick={(e) => {
          expectType<HTMLButtonElement>(e.currentTarget);
          expectType<MouseEvent["button"]>(e.button);
        }}
      >
        ok
      </button>
      <input
        ref={inputRef}
        maxlength={10}
        value={signal("v")}
        onInput={(e) => {
          expectType<HTMLInputElement>(e.currentTarget);
          expectType<string>(e.currentTarget.value);
        }}
      />
      <label for="field">field</label>
      <ol type="i" start={3}>
        <li value={1}>one</li>
      </ol>
      <img src="/x.png" loading="lazy" decoding="async" alt="" />
      <video playsinline muted preload="metadata" />
      <table>
        <tbody>
          <tr>
            <td colspan={2} rowspan={1} />
          </tr>
        </tbody>
      </table>
      <svg viewBox="0 0 10 10" fill="none">
        <circle
          cx={5}
          cy={5}
          r={4}
          stroke-width={2}
          onClick={(e) => {
            expectType<SVGCircleElement>(e.currentTarget);
          }}
        />
        <path d="M0 0 L10 10" fill-rule="evenodd" />
      </svg>
      <math display="block">
        <mi mathvariant="normal">x</mi>
      </math>
      <style media="screen">{`.box{}`}</style>
    </div>
  );
}

// Custom function components take their own props; `key` comes from
// IntrinsicAttributes.
const Item: FC<{ id: string; onPick?: (id: string) => void }> = (props) => <i>{props.id}</i>;
function ValidComponent(): JSXNode {
  return <Item key="a" id="x" onPick={(id) => expectType<string>(id)} />;
}

// ============================================================
// Invalid usages — must be compile errors
// ============================================================

function InvalidElements(): JSXNode[] {
  return [
    // @ts-expect-error — unknown tags are compile errors (strict IntrinsicElements)
    <foo />,

    // @ts-expect-error — event handlers are functions, not strings
    <button onClick="alert(1)" />,

    // @ts-expect-error — <button type> is an enum: "submit" | "reset" | "button"
    <button type="bogus" />,

    // @ts-expect-error — maxlength is a number
    <input maxlength="ten" />,

    // @ts-expect-error — aria booleans are Booleanish, not arbitrary strings
    <div aria-hidden="maybe" />,

    // @ts-expect-error — capture-phase props are not part of the event system
    <div onClickCapture={() => undefined} />,

    // @ts-expect-error — <ol type> is an enum: "1" | "a" | "A" | "i" | "I"
    <ol type="x" />,

    // @ts-expect-error — img loading is "eager" | "lazy"
    <img loading="fast" />,

    // @ts-expect-error — dialog closedby is "none" | "closerequest" | "any"
    <dialog closedby="never" />,

    // @ts-expect-error — dangerouslySetInnerHTML does not exist (raw() is the only path)
    <div dangerouslySetInnerHTML={{ __html: "<b/>" }} />,
  ];
}

function InvalidHandlerTarget(): JSXNode {
  return (
    <input
      onInput={(e) => {
        // @ts-expect-error — currentTarget is an HTMLInputElement, not a select
        expectType<HTMLSelectElement>(e.currentTarget);
      }}
    />
  );
}

describe("jsx type layer", () => {
  it("valid typed elements mount and unmount", () => {
    const container = createContainer();
    function App() {
      return ValidElements();
    }
    render(<App />, container);
    expect(container.querySelector("button")).not.toBeNull();
    expect(container.querySelector("circle")).not.toBeNull();
    unmount(container);
    container.remove();

    // Keep the compile-only fixtures referenced (noUnusedLocals).
    void ValidComponent;
    void InvalidElements;
    void InvalidHandlerTarget;
  });
});

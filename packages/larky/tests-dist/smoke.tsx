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
 * Consumer-view type smoke test over the BUNDLED dist d.ts (tsconfig.dist.json
 * maps "@lark.js/larky" to ./dist). The source-path typecheck cannot catch
 * dts-flattening regressions — this fixture reproduces exactly what a
 * file:-installed consumer sees (the JSX.IntrinsicElements self-reference bug
 * shipped because only src paths were checked).
 */
import { render, useSignal, type FC, type JSX, type HTMLAttributes } from "@lark.js/larky";

// React-19-style JSX namespace import — `JSX.HTMLAttributes` in a user type
// position (the shadcn/preact-flavored consumer pattern).
interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "outline";
}

function Badge({ variant, ...props }: BadgeProps): JSX.Element {
  return <span data-slot="badge" data-variant={variant} {...props} />;
}

// Top-level attribute types keep working too.
interface ChipProps extends HTMLAttributes<HTMLButtonElement> {
  label: string;
}

const Chip: FC<ChipProps> = (props) => {
  const clicks = useSignal(0);
  return (
    <button
      type="button"
      class={props.class}
      onClick={(e) => {
        e.currentTarget satisfies HTMLButtonElement;
        clicks.value++;
      }}
    >
      {props.label}:{clicks.value}
    </button>
  );
};

export function App(): JSX.Element {
  return (
    <div class="app" tabindex={0}>
      <Badge variant="outline" className="badge">
        hi
      </Badge>
      <Chip label="go" />
      <svg viewBox="0 0 1 1">
        <path d="M0 0" />
      </svg>
    </div>
  );
}

export function mount(el: Element): void {
  render(<App />, el);
}

// @ts-expect-error — unknown tags must stay compile errors through dist
export const bad: JSX.Element = <not-a-tag />;

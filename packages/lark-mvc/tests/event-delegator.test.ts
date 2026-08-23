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

import { describe, it, expect, vi, afterEach } from "vitest";
import { EventDelegator } from "../src/event-delegator";

describe("EventDelegator", () => {
  // Track bindings for cleanup
  const boundTypes: string[] = [];

  afterEach(() => {
    for (const type of boundTypes) {
      EventDelegator.unbind(type);
    }
    boundTypes.length = 0;
  });

  describe("bind / unbind", () => {
    it("bind attaches event listener to document.body", () => {
      const addSpy = vi.spyOn(document.body, "addEventListener");
      EventDelegator.bind("test-bind-1");
      boundTypes.push("test-bind-1");
      expect(addSpy).toHaveBeenCalledWith("test-bind-1", expect.any(Function), true);
      addSpy.mockRestore();
    });

    it("bind increments reference count", () => {
      // Bind twice for the same event type
      EventDelegator.bind("test-bind-ref");
      EventDelegator.bind("test-bind-ref");
      boundTypes.push("test-bind-ref"); // Only push once for cleanup

      const removeSpy = vi.spyOn(document.body, "removeEventListener");
      // First unbind should NOT remove (ref count > 1)
      EventDelegator.unbind("test-bind-ref");
      expect(removeSpy).not.toHaveBeenCalled();

      // Second unbind should remove (ref count = 0)
      EventDelegator.unbind("test-bind-ref");
      expect(removeSpy).toHaveBeenCalledWith("test-bind-ref", expect.any(Function), true);
      removeSpy.mockRestore();
      boundTypes.length = 0; // Already cleaned up
    });

    it("unbind removes listener when count reaches 0", () => {
      EventDelegator.bind("test-unbind");
      const removeSpy = vi.spyOn(document.body, "removeEventListener");
      EventDelegator.unbind("test-unbind");
      expect(removeSpy).toHaveBeenCalled();
      removeSpy.mockRestore();
    });

    it("bind/unbind refcount pairs balance without error", () => {
      EventDelegator.bind("test-refpair");
      EventDelegator.bind("test-refpair");
      EventDelegator.unbind("test-refpair");
      EventDelegator.unbind("test-refpair");
    });

    it("unbind for non-existent event type does not throw", () => {
      expect(() => {
        EventDelegator.unbind("nonexistent-event-xyz");
      }).not.toThrow();
    });
  });

  describe("setFrameGetter", () => {
    it("accepts a getter function", () => {
      expect(() => {
        EventDelegator.setFrameGetter((_id: string, _unused: void) => undefined);
      }).not.toThrow();
    });
  });
});

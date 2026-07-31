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

import { TTFlag, type TTEntry } from "./types";

const TT_SIZE = 1 << 20;
const TT_MASK = TT_SIZE - 1;

export interface TranspositionTable {
  entries: Array<TTEntry | null>;
}

export function createTT(): TranspositionTable {
  return { entries: new Array<TTEntry | null>(TT_SIZE).fill(null) };
}

export function ttProbe(tt: TranspositionTable, hash: bigint): TTEntry | null {
  const idx = Number(hash & BigInt(TT_MASK));
  const entry = tt.entries[idx];
  if (entry && entry.hash === hash) {
    return entry;
  }
  return null;
}

export function ttStore(
  tt: TranspositionTable,
  hash: bigint,
  depth: number,
  score: number,
  flag: TTFlag,
  bestMove: number,
): void {
  const idx = Number(hash & BigInt(TT_MASK));
  const existing = tt.entries[idx];
  if (existing && existing.hash === hash && existing.depth > depth) {
    return;
  }
  tt.entries[idx] = { hash, depth, score, flag, bestMove };
}

export function ttClear(tt: TranspositionTable): void {
  tt.entries.fill(null);
}

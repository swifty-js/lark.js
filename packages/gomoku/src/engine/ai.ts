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

import { Player, type SearchResult } from "./types";
import { type BoardState } from "./board";
import { findBestMove } from "./search";

export interface Difficulty {
  label: string;
  maxDepth: number;
  timeLimitMs: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { label: "Easy", maxDepth: 4, timeLimitMs: 800 },
  { label: "Medium", maxDepth: 8, timeLimitMs: 2500 },
  { label: "Hard", maxDepth: 12, timeLimitMs: 6000 },
];

export function computeAIMove(
  board: BoardState,
  aiPlayer: Player,
  difficulty: Difficulty,
): SearchResult {
  return findBestMove(
    board,
    aiPlayer,
    difficulty.maxDepth,
    difficulty.timeLimitMs,
  );
}

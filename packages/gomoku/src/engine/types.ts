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

export const BOARD_SIZE = 15;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

export const enum Player {
  Empty = 0,
  Black = 1,
  White = 2,
}

export interface Move {
  index: number;
  player: Player;
}

export const enum PatternScore {
  FIVE = 10_000_000,
  OPEN_FOUR = 1_000_000,
  FOUR = 100_000,
  OPEN_THREE = 50_000,
  THREE = 5_000,
  OPEN_TWO = 1_000,
  TWO = 100,
  ONE = 10,
}

export const enum TTFlag {
  Exact = 0,
  LowerBound = 1,
  UpperBound = 2,
}

export interface TTEntry {
  hash: bigint;
  depth: number;
  score: number;
  flag: TTFlag;
  bestMove: number;
}

export const enum GameStatus {
  Playing = 0,
  BlackWin = 1,
  WhiteWin = 2,
  Draw = 3,
}

export interface SearchResult {
  bestMove: number;
  score: number;
  depth: number;
  nodes: number;
}

export const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export function toRow(index: number): number {
  return (index / BOARD_SIZE) | 0;
}

export function toCol(index: number): number {
  return index % BOARD_SIZE;
}

export function toIndex(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}

export function isValidPos(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

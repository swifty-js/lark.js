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

import { CELL_COUNT, Player, isValidPos, toCol, toIndex, toRow } from "./types";
import type { BoardState } from "./board";
import { evaluateMove } from "./patterns";

const RADIUS = 2;

export function generateMoves(board: BoardState): number[] {
  if (board.moveCount === 0) {
    return [toIndex(7, 7)];
  }

  const candidates = new Set<number>();
  const cells = board.cells;

  for (let i = 0; i < CELL_COUNT; i++) {
    if (cells[i] === Player.Empty) continue;
    const row = toRow(i);
    const col = toCol(i);
    for (let dr = -RADIUS; dr <= RADIUS; dr++) {
      for (let dc = -RADIUS; dc <= RADIUS; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (isValidPos(r, c)) {
          const idx = toIndex(r, c);
          if (cells[idx] === Player.Empty) {
            candidates.add(idx);
          }
        }
      }
    }
  }

  return [...candidates];
}

export function orderMoves(
  board: BoardState,
  moves: number[],
  player: Player,
  ttBestMove: number,
  killerMoves: number[],
  historyTable: Int32Array,
): number[] {
  const scored: Array<{ move: number; score: number }> = moves.map((move) => {
    let score = 0;
    if (move === ttBestMove) {
      score += 100_000_000;
    }
    if (killerMoves.includes(move)) {
      score += 10_000_000;
    }
    score += historyTable[move] * 100;
    score += evaluateMove(board, move, player);
    return { move, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.move);
}

export function generateThreatMoves(
  board: BoardState,
  player: Player,
): number[] {
  const allMoves = generateMoves(board);
  const threats: number[] = [];
  const cells = board.cells;

  for (const move of allMoves) {
    cells[move] = player;
    if (isThreatMove(board, move, player)) {
      threats.push(move);
    }
    cells[move] = Player.Empty;
  }

  return threats;
}

function isThreatMove(
  board: BoardState,
  index: number,
  player: Player,
): boolean {
  const row = toRow(index);
  const col = toCol(index);
  const dirs: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];

  for (const [dr, dc] of dirs) {
    let count = 1;
    let openEnds = 0;

    let r = row + dr;
    let c = col + dc;
    while (isValidPos(r, c) && board.cells[toIndex(r, c)] === player) {
      count++;
      r += dr;
      c += dc;
    }
    if (isValidPos(r, c) && board.cells[toIndex(r, c)] === Player.Empty) {
      openEnds++;
    }

    r = row - dr;
    c = col - dc;
    while (isValidPos(r, c) && board.cells[toIndex(r, c)] === player) {
      count++;
      r -= dr;
      c -= dc;
    }
    if (isValidPos(r, c) && board.cells[toIndex(r, c)] === Player.Empty) {
      openEnds++;
    }

    if (count >= 4 && openEnds >= 1) return true;
    if (count === 3 && openEnds === 2) return true;
  }

  return false;
}

export function createHistoryTable(): Int32Array {
  return new Int32Array(CELL_COUNT);
}

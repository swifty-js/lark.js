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

import {
  BOARD_SIZE,
  DIRECTIONS,
  PatternScore,
  Player,
  isValidPos,
  toCol,
  toIndex,
  toRow,
} from "./types";
import type { BoardState } from "./board";

interface LineInfo {
  count: number;
  openEnds: number;
}

function analyzeDirection(
  board: BoardState,
  row: number,
  col: number,
  dr: number,
  dc: number,
  player: Player,
): LineInfo {
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

  return { count, openEnds };
}

export function scorePosition(
  board: BoardState,
  index: number,
  player: Player,
): number {
  const row = toRow(index);
  const col = toCol(index);
  let total = 0;

  for (const [dr, dc] of DIRECTIONS) {
    const { count, openEnds } = analyzeDirection(
      board,
      row,
      col,
      dr,
      dc,
      player,
    );
    total += scoreLine(count, openEnds);
  }

  return total;
}

function scoreLine(count: number, openEnds: number): number {
  if (count >= 5) return PatternScore.FIVE;
  if (openEnds === 0) return 0;

  switch (count) {
    case 4:
      return openEnds === 2 ? PatternScore.OPEN_FOUR : PatternScore.FOUR;
    case 3:
      return openEnds === 2 ? PatternScore.OPEN_THREE : PatternScore.THREE;
    case 2:
      return openEnds === 2 ? PatternScore.OPEN_TWO : PatternScore.TWO;
    case 1:
      return PatternScore.ONE;
    default:
      return 0;
  }
}

export function evaluateBoard(board: BoardState, aiPlayer: Player): number {
  let score = 0;
  const humanPlayer = aiPlayer === Player.Black ? Player.White : Player.Black;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const idx = toIndex(r, c);
      const cell = board.cells[idx];
      if (cell === aiPlayer) {
        score += evaluateCell(board, r, c, aiPlayer);
      } else if (cell === humanPlayer) {
        score -= evaluateCell(board, r, c, humanPlayer) * 1.1;
      }
    }
  }

  return score;
}

function evaluateCell(
  board: BoardState,
  row: number,
  col: number,
  player: Player,
): number {
  let total = 0;
  for (const [dr, dc] of DIRECTIONS) {
    const { count, openEnds } = analyzeDirection(
      board,
      row,
      col,
      dr,
      dc,
      player,
    );
    total += scoreLine(count, openEnds);
  }
  return total;
}

export function evaluateMove(
  board: BoardState,
  index: number,
  player: Player,
): number {
  const opp = player === Player.Black ? Player.White : Player.Black;
  const attackScore = scorePosition(board, index, player);
  const defenseScore = scorePosition(board, index, opp);
  const row = toRow(index);
  const col = toCol(index);
  const centerDist = Math.abs(row - 7) + Math.abs(col - 7);
  const positionBonus = (14 - centerDist) * 2;
  return attackScore + defenseScore * 0.9 + positionBonus;
}

export function hasImmediateWin(
  board: BoardState,
  index: number,
  player: Player,
): boolean {
  const row = toRow(index);
  const col = toCol(index);
  for (const [dr, dc] of DIRECTIONS) {
    const { count } = analyzeDirection(board, row, col, dr, dc, player);
    if (count >= 5) return true;
  }
  return false;
}

export function createsOpenFour(
  board: BoardState,
  index: number,
  player: Player,
): boolean {
  const row = toRow(index);
  const col = toCol(index);
  for (const [dr, dc] of DIRECTIONS) {
    const { count, openEnds } = analyzeDirection(
      board,
      row,
      col,
      dr,
      dc,
      player,
    );
    if (count === 4 && openEnds === 2) return true;
  }
  return false;
}

export function createsFour(
  board: BoardState,
  index: number,
  player: Player,
): boolean {
  const row = toRow(index);
  const col = toCol(index);
  for (const [dr, dc] of DIRECTIONS) {
    const { count, openEnds } = analyzeDirection(
      board,
      row,
      col,
      dr,
      dc,
      player,
    );
    if (count === 4 && openEnds >= 1) return true;
  }
  return false;
}

export function createsOpenThree(
  board: BoardState,
  index: number,
  player: Player,
): boolean {
  const row = toRow(index);
  const col = toCol(index);
  for (const [dr, dc] of DIRECTIONS) {
    const { count, openEnds } = analyzeDirection(
      board,
      row,
      col,
      dr,
      dc,
      player,
    );
    if (count === 3 && openEnds === 2) return true;
  }
  return false;
}

export function isThreat(
  board: BoardState,
  index: number,
  player: Player,
): boolean {
  return (
    createsFour(board, index, player) || createsOpenThree(board, index, player)
  );
}

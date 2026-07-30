import { Player, type SearchResult } from "./types";
import { type BoardState } from "./board";
import { findBestMove } from "./search";

export interface Difficulty {
  label: string;
  maxDepth: number;
  timeLimitMs: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { label: "简单", maxDepth: 4, timeLimitMs: 800 },
  { label: "中等", maxDepth: 8, timeLimitMs: 2500 },
  { label: "困难", maxDepth: 12, timeLimitMs: 6000 },
];

export function computeAIMove(
  board: BoardState,
  aiPlayer: Player,
  difficulty: Difficulty,
): SearchResult {
  return findBestMove(board, aiPlayer, difficulty.maxDepth, difficulty.timeLimitMs);
}

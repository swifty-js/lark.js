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
  return findBestMove(board, aiPlayer, difficulty.maxDepth, difficulty.timeLimitMs);
}

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

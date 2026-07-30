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

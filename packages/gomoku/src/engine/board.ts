import {
  BOARD_SIZE,
  CELL_COUNT,
  DIRECTIONS,
  GameStatus,
  Player,
  isValidPos,
  toCol,
  toIndex,
  toRow,
  type Move,
} from "./types";

const ZOBRIST_TABLE: bigint[][] = [];
const ZOBRIST_TURN: bigint = 0x9e3779b97f4a7c15n;

function initZobrist(): void {
  let seed = 0x12345678n;
  const next = (): bigint => {
    seed ^= seed << 13n;
    seed ^= seed >> 7n;
    seed ^= seed << 17n;
    seed &= 0xffffffffffffffffn;
    return seed;
  };
  for (let i = 0; i < CELL_COUNT; i++) {
    ZOBRIST_TABLE[i] = [0n, next(), next()];
  }
}
initZobrist();

export interface BoardState {
  cells: Int8Array;
  hash: bigint;
  moveCount: number;
  history: Move[];
  status: GameStatus;
}

export function createBoard(): BoardState {
  return {
    cells: new Int8Array(CELL_COUNT),
    hash: 0n,
    moveCount: 0,
    history: [],
    status: GameStatus.Playing,
  };
}

export function cloneBoard(board: BoardState): BoardState {
  return {
    cells: new Int8Array(board.cells),
    hash: board.hash,
    moveCount: board.moveCount,
    history: [...board.history],
    status: board.status,
  };
}

export function currentPlayer(board: BoardState): Player {
  return board.moveCount % 2 === 0 ? Player.Black : Player.White;
}

export function opponent(player: Player): Player {
  return player === Player.Black ? Player.White : Player.Black;
}

export function makeMove(board: BoardState, index: number): void {
  const player = currentPlayer(board);
  board.cells[index] = player;
  board.hash ^= ZOBRIST_TABLE[index][player];
  board.hash ^= ZOBRIST_TURN;
  board.moveCount++;
  board.history.push({ index, player });
  if (checkWin(board, index, player)) {
    board.status = player === Player.Black ? GameStatus.BlackWin : GameStatus.WhiteWin;
  } else if (board.moveCount === CELL_COUNT) {
    board.status = GameStatus.Draw;
  }
}

export function unmakeMove(board: BoardState): void {
  const move = board.history.pop();
  if (!move) return;
  board.cells[move.index] = Player.Empty;
  board.hash ^= ZOBRIST_TABLE[move.index][move.player];
  board.hash ^= ZOBRIST_TURN;
  board.moveCount--;
  board.status = GameStatus.Playing;
}

export function checkWin(board: BoardState, index: number, player: Player): boolean {
  const row = toRow(index);
  const col = toCol(index);
  for (const [dr, dc] of DIRECTIONS) {
    let count = 1;
    for (let i = 1; i < 5; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (!isValidPos(r, c) || board.cells[toIndex(r, c)] !== player) break;
      count++;
    }
    for (let i = 1; i < 5; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (!isValidPos(r, c) || board.cells[toIndex(r, c)] !== player) break;
      count++;
    }
    if (count >= 5) return true;
  }
  return false;
}

/** Returns the cells of the winning line (at least five in a row) through index, or an empty array if none */
export function getWinLine(board: BoardState, index: number, player: Player): number[] {
  const row = toRow(index);
  const col = toCol(index);
  for (const [dr, dc] of DIRECTIONS) {
    const line: number[] = [index];
    for (let i = 1; i < 5; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (!isValidPos(r, c) || board.cells[toIndex(r, c)] !== player) break;
      line.push(toIndex(r, c));
    }
    for (let i = 1; i < 5; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (!isValidPos(r, c) || board.cells[toIndex(r, c)] !== player) break;
      line.push(toIndex(r, c));
    }
    if (line.length >= 5) return line;
  }
  return [];
}

export function getLine(
  board: BoardState,
  row: number,
  col: number,
  dr: number,
  dc: number,
  length: number,
): Int8Array {
  const line = new Int8Array(length);
  for (let i = 0; i < length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    if (isValidPos(r, c)) {
      line[i] = board.cells[toIndex(r, c)];
    } else {
      line[i] = -1;
    }
  }
  return line;
}

export function zobristForMove(index: number, player: Player): bigint {
  return ZOBRIST_TABLE[index][player];
}

export function zobristTurn(): bigint {
  return ZOBRIST_TURN;
}

export function boardToGrid(board: BoardState): number[][] {
  const grid: number[][] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row: number[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      row.push(board.cells[toIndex(r, c)]);
    }
    grid.push(row);
  }
  return grid;
}

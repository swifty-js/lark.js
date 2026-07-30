import { defineView, useState } from "@lark.js/mvc";
import template from "./game.html";
import {
  createBoard,
  makeMove,
  unmakeMove,
  currentPlayer,
  opponent,
  getWinLine,
  boardToGrid,
  DIFFICULTIES,
  BOARD_SIZE,
  Player,
  GameStatus,
  toIndex,
  toRow,
  toCol,
  type BoardState,
  type Difficulty,
  type AiRequest,
  type AiResponse,
} from "../engine/index";

interface CellData {
  index: number;
  row: number;
  col: number;
  player: number;
  isLast: boolean;
  isStar: boolean;
  isWin: boolean;
}

const STAR_POINTS = new Set([
  toIndex(3, 3),
  toIndex(3, 7),
  toIndex(3, 11),
  toIndex(7, 3),
  toIndex(7, 7),
  toIndex(7, 11),
  toIndex(11, 3),
  toIndex(11, 7),
  toIndex(11, 11),
]);

const COL_LABELS = Array.from({ length: BOARD_SIZE }, (_, i) => String.fromCharCode(65 + i));
const ROW_LABELS = Array.from({ length: BOARD_SIZE }, (_, i) => String(BOARD_SIZE - i));

/** Minimum display duration for AI response to avoid the "thinking" state flashing by */
const MIN_THINK_MS = 300;

function computeWinLine(board: BoardState): Set<number> {
  if (board.status !== GameStatus.BlackWin && board.status !== GameStatus.WhiteWin) {
    return new Set();
  }
  const last = board.history[board.history.length - 1];
  if (!last) return new Set();
  return new Set(getWinLine(board, last.index, last.player));
}

function buildCells(board: BoardState, lastMove: number): CellData[] {
  const grid = boardToGrid(board);
  const winLine = computeWinLine(board);
  const cells: CellData[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const idx = toIndex(r, c);
      cells.push({
        index: idx,
        row: r,
        col: c,
        player: grid[r][c],
        isLast: idx === lastMove,
        isStar: STAR_POINTS.has(idx),
        isWin: winLine.has(idx),
      });
    }
  }
  return cells;
}

function statusText(board: BoardState, aiPlayer: Player, thinking: boolean): string {
  if (thinking) return "AI is thinking";
  const human = opponent(aiPlayer);
  switch (board.status) {
    case GameStatus.BlackWin:
      return aiPlayer === Player.Black ? "AI wins (Black)" : "You win! (Black)";
    case GameStatus.WhiteWin:
      return aiPlayer === Player.White ? "AI wins (White)" : "You win! (White)";
    case GameStatus.Draw:
      return "Draw";
    default:
      return currentPlayer(board) === human ? "Your turn" : "Waiting for AI";
  }
}

function moveLabel(moveIdx: number, index: number): string {
  const row = toRow(index);
  const col = toCol(index);
  const colLabel = String.fromCharCode(65 + col);
  const player = moveIdx % 2 === 0 ? "●" : "○";
  return `${player} ${colLabel}${BOARD_SIZE - row}`;
}

function formatNodes(nodes: number): string {
  if (nodes >= 1_000_000) return `${(nodes / 1_000_000).toFixed(1)}M`;
  if (nodes >= 1_000) return `${(nodes / 1_000).toFixed(1)}K`;
  return String(nodes);
}

interface LarkClickEvent {
  params?: Record<string, string>;
}

function isLarkEvent(e: unknown): e is LarkClickEvent {
  return typeof e === "object" && e !== null;
}

export default defineView((ctx) => {
  let board = createBoard();
  let aiPlayer = Player.White;
  let difficulty: Difficulty = DIFFICULTIES[1];
  let thinking = false;
  let moveList: string[] = [];
  let lastStats: AiResponse | null = null;
  let requestSeq = 0;
  let destroyed = false;

  const [getDifficultyIdx, setDifficultyIdx] = useState("difficultyIdx", 1);

  const worker = new Worker(new URL("../engine/ai.worker.ts", import.meta.url), { type: "module" });
  let requestSentAt = 0;

  ctx.on("destroy", () => {
    destroyed = true;
    worker.terminate();
  });

  function buildData(): Record<string, unknown> {
    const lastMove = board.history.length > 0 ? board.history[board.history.length - 1].index : -1;
    const humanIsBlack = aiPlayer === Player.White;
    return {
      cells: buildCells(board, lastMove),
      colLabels: COL_LABELS,
      rowLabels: ROW_LABELS,
      statusText: statusText(board, aiPlayer, thinking),
      isThinking: thinking,
      difficulties: DIFFICULTIES.map((d) => d.label),
      difficultyIdx: getDifficultyIdx(),
      moves: [...moveList].reverse(),
      canUndo: board.history.length > 0 && !thinking,
      gameOver: board.status !== GameStatus.Playing,
      humanWin:
        (board.status === GameStatus.BlackWin && humanIsBlack) ||
        (board.status === GameStatus.WhiteWin && !humanIsBlack),
      humanIsBlack,
      stats: lastStats
        ? {
            depth: lastStats.depth,
            nodes: formatNodes(lastStats.nodes),
            timeMs: lastStats.timeMs,
          }
        : null,
    };
  }

  function syncUI(): void {
    ctx.updater.set(buildData()).digest();
  }

  function applyAIMove(res: AiResponse): void {
    thinking = false;
    if (
      board.status === GameStatus.Playing &&
      currentPlayer(board) === aiPlayer &&
      res.bestMove >= 0 &&
      board.cells[res.bestMove] === Player.Empty
    ) {
      makeMove(board, res.bestMove);
      moveList.push(moveLabel(board.moveCount - 1, res.bestMove));
      lastStats = res;
    }
    syncUI();
  }

  worker.onmessage = (event: MessageEvent<AiResponse>) => {
    if (destroyed) return;
    const res = event.data;
    if (res.requestId !== requestSeq) return; // Discard stale results after undo/new game
    const elapsed = performance.now() - requestSentAt;
    const delay = Math.max(0, MIN_THINK_MS - elapsed);
    if (delay > 0) {
      setTimeout(() => {
        if (!destroyed && res.requestId === requestSeq) applyAIMove(res);
      }, delay);
    } else {
      applyAIMove(res);
    }
  };

  function runAI(): void {
    if (board.status !== GameStatus.Playing) return;
    if (currentPlayer(board) !== aiPlayer) return;

    thinking = true;
    syncUI();

    requestSentAt = performance.now();
    const req: AiRequest = {
      requestId: ++requestSeq,
      moves: board.history.map((m) => m.index),
      maxDepth: difficulty.maxDepth,
      timeLimitMs: difficulty.timeLimitMs,
    };
    worker.postMessage(req);
  }

  function resetGame(): void {
    board = createBoard();
    moveList = [];
    thinking = false;
    lastStats = null;
    requestSeq++; // Invalidate in-flight AI results
  }

  ctx.updater.set(buildData());

  return {
    template,
    events: {
      "placeStone<click>": (e: unknown) => {
        if (!isLarkEvent(e) || !e.params) return;
        const index = Number(e.params["index"]);
        if (thinking) return;
        if (board.status !== GameStatus.Playing) return;
        if (currentPlayer(board) === aiPlayer) return;
        if (board.cells[index] !== Player.Empty) return;

        makeMove(board, index);
        moveList.push(moveLabel(board.moveCount - 1, index));
        syncUI();
        runAI();
      },

      "newGame<click>": () => {
        resetGame();
        syncUI();
        if (aiPlayer === Player.Black) runAI();
      },

      "undo<click>": () => {
        if (thinking || board.history.length === 0) return;
        requestSeq++;
        unmakeMove(board);
        moveList.pop();
        if (board.history.length > 0 && currentPlayer(board) === aiPlayer) {
          unmakeMove(board);
          moveList.pop();
        }
        syncUI();
      },

      "setDifficulty<click>": (e: unknown) => {
        if (!isLarkEvent(e) || !e.params) return;
        const idx = Number(e.params["idx"]);
        if (idx >= 0 && idx < DIFFICULTIES.length) {
          difficulty = DIFFICULTIES[idx];
          setDifficultyIdx(idx);
        }
      },

      "switchSide<click>": () => {
        aiPlayer = opponent(aiPlayer);
        resetGame();
        syncUI();
        if (aiPlayer === Player.Black) runAI();
      },
    },
  };
});

import { CELL_COUNT, GameStatus, Player, TTFlag, type SearchResult } from "./types";
import { type BoardState, makeMove, unmakeMove, opponent } from "./board";
import { evaluateBoard, hasImmediateWin, isThreat } from "./patterns";
import { generateMoves, orderMoves, createHistoryTable } from "./moves";
import { createTT, ttProbe, ttStore, type TranspositionTable } from "./tt";
import { vcfSearch } from "./vcf";

const INF = 99_999_999;
const WIN_SCORE = 10_000_000;
const MAX_DEPTH = 12;
const ASPIRATION_WINDOW = 5000;
const FUTILITY_MARGIN = 8000;
const LMR_FULL_DEPTH_MOVES = 4;
const LMR_REDUCTION_LIMIT = 3;
const QUIESCENCE_DEPTH = 4;
const ROOT_BEAM = 32;
const BRANCH_LIMIT = 20;
const VCF_DEPTH = 16;

interface SearchState {
  tt: TranspositionTable;
  historyTable: Int32Array;
  killerMoves: number[][];
  nodes: number;
  aborted: boolean;
}

interface RootResult {
  move: number;
  score: number;
}

function createSearchState(): SearchState {
  const killerMoves: number[][] = [];
  for (let i = 0; i < MAX_DEPTH + QUIESCENCE_DEPTH + 2; i++) {
    killerMoves.push([-1, -1]);
  }
  return {
    tt: createTT(),
    historyTable: createHistoryTable(),
    killerMoves,
    nodes: 0,
    aborted: false,
  };
}

export function findBestMove(
  board: BoardState,
  aiPlayer: Player,
  maxDepth: number = MAX_DEPTH,
  timeLimitMs: number = 5000,
): SearchResult {
  const state = createSearchState();
  const startTime = performance.now();

  const moves = generateMoves(board);
  if (moves.length === 0) {
    return { bestMove: -1, score: 0, depth: 0, nodes: 0 };
  }
  if (moves.length === 1) {
    return { bestMove: moves[0], score: 0, depth: 1, nodes: 1 };
  }

  // 1. Immediate five-in-a-row wins outright
  for (const move of moves) {
    if (hasImmediateWin(board, move, aiPlayer)) {
      return { bestMove: move, score: WIN_SCORE, depth: 1, nodes: 1 };
    }
  }

  // 2. Block opponent's winning point (block one if double-four)
  const opp = opponent(aiPlayer);
  for (const move of moves) {
    if (hasImmediateWin(board, move, opp)) {
      return { bestMove: move, score: 0, depth: 1, nodes: 1 };
    }
  }

  // 3. VCF (Victory by Continuous Fours) forced win
  const vcfMove = vcfSearch(board, aiPlayer, VCF_DEPTH);
  if (vcfMove >= 0) {
    return { bestMove: vcfMove, score: WIN_SCORE, depth: 1, nodes: 1 };
  }

  // 4. Iterative deepening + root PVS + Aspiration Window
  let bestMove = moves[0];
  let bestScore = 0;
  let completedDepth = 0;

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (performance.now() - startTime > timeLimitMs) break;

    const useAspiration = depth >= 4 && completedDepth > 0;
    const result = rootSearch(
      board,
      state,
      aiPlayer,
      depth,
      bestMove,
      bestScore,
      useAspiration,
      startTime,
      timeLimitMs,
    );
    if (state.aborted) break;

    bestMove = result.move;
    bestScore = result.score;
    completedDepth = depth;

    if (Math.abs(bestScore) >= WIN_SCORE - 1000) break;
  }

  return {
    bestMove,
    score: bestScore,
    depth: completedDepth,
    nodes: state.nodes,
  };
}

function rootSearch(
  board: BoardState,
  state: SearchState,
  aiPlayer: Player,
  depth: number,
  prevBest: number,
  prevScore: number,
  useAspiration: boolean,
  startTime: number,
  timeLimitMs: number,
): RootResult {
  let alpha = useAspiration ? prevScore - ASPIRATION_WINDOW : -INF;
  let beta = useAspiration ? prevScore + ASPIRATION_WINDOW : INF;

  for (;;) {
    const result = rootPass(
      board,
      state,
      aiPlayer,
      depth,
      prevBest,
      alpha,
      beta,
      startTime,
      timeLimitMs,
    );
    if (state.aborted) return result;

    // Fall back to full window re-search on aspiration window failure
    if (result.score <= alpha) {
      alpha = -INF;
    } else if (result.score >= beta) {
      beta = INF;
    } else {
      return result;
    }
  }
}

function rootPass(
  board: BoardState,
  state: SearchState,
  aiPlayer: Player,
  depth: number,
  prevBest: number,
  alpha: number,
  beta: number,
  startTime: number,
  timeLimitMs: number,
): RootResult {
  const moves = generateMoves(board);
  const killers = state.killerMoves[0] ?? [-1, -1];
  const ordered = orderMoves(board, moves, aiPlayer, prevBest, killers, state.historyTable).slice(
    0,
    ROOT_BEAM,
  );

  let bestMove = ordered[0];
  let bestScore = -INF;
  let moveCount = 0;

  for (const move of ordered) {
    if (performance.now() - startTime > timeLimitMs) {
      state.aborted = true;
      break;
    }

    makeMove(board, move);
    let score: number;

    if (moveCount === 0) {
      score = -negamax(
        board,
        state,
        aiPlayer,
        opponent(aiPlayer),
        depth - 1,
        -beta,
        -alpha,
        1,
        startTime,
        timeLimitMs,
      );
    } else {
      // PVS: verify non-principal-variation moves with a null window first
      score = -negamax(
        board,
        state,
        aiPlayer,
        opponent(aiPlayer),
        depth - 1,
        -alpha - 1,
        -alpha,
        1,
        startTime,
        timeLimitMs,
      );
      if (!state.aborted && score > alpha && score < beta) {
        score = -negamax(
          board,
          state,
          aiPlayer,
          opponent(aiPlayer),
          depth - 1,
          -beta,
          -alpha,
          1,
          startTime,
          timeLimitMs,
        );
      }
    }

    unmakeMove(board);
    if (state.aborted) break;

    moveCount++;
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }

  if (!state.aborted) {
    ttStore(state.tt, board.hash, depth, bestScore, TTFlag.Exact, bestMove);
  }
  return { move: bestMove, score: bestScore };
}

function negamax(
  board: BoardState,
  state: SearchState,
  aiPlayer: Player,
  current: Player,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  startTime: number,
  timeLimitMs: number,
): number {
  state.nodes++;

  if (state.nodes % 4096 === 0) {
    if (performance.now() - startTime > timeLimitMs) {
      state.aborted = true;
      return 0;
    }
  }

  if (state.aborted) return 0;

  if (board.status !== GameStatus.Playing) {
    if (board.status === GameStatus.Draw) return 0;
    const winner = board.status === GameStatus.BlackWin ? Player.Black : Player.White;
    return winner === aiPlayer ? WIN_SCORE - ply : -(WIN_SCORE - ply);
  }

  if (depth <= 0) {
    return quiescence(board, state, aiPlayer, current, alpha, beta, ply, startTime, timeLimitMs);
  }

  const hash = board.hash;
  const ttEntry = ttProbe(state.tt, hash);
  let ttBestMove = -1;

  if (ttEntry && ttEntry.depth >= depth) {
    ttBestMove = ttEntry.bestMove;
    if (ttEntry.flag === TTFlag.Exact) return ttEntry.score;
    if (ttEntry.flag === TTFlag.LowerBound) {
      alpha = Math.max(alpha, ttEntry.score);
    } else if (ttEntry.flag === TTFlag.UpperBound) {
      beta = Math.min(beta, ttEntry.score);
    }
    if (alpha >= beta) return ttEntry.score;
  } else if (ttEntry) {
    ttBestMove = ttEntry.bestMove;
  }

  const moves = generateMoves(board);
  if (moves.length === 0) return 0;

  const killers = state.killerMoves[ply] ?? [-1, -1];
  const orderedMoves = orderMoves(
    board,
    moves,
    current,
    ttBestMove,
    killers,
    state.historyTable,
  ).slice(0, BRANCH_LIMIT);

  // Futility Pruning: prune at shallow depth when static eval is far below alpha
  if (depth <= 3 && ply > 0) {
    const staticEval = evaluateBoard(board, aiPlayer) * (current === aiPlayer ? 1 : -1);
    if (staticEval + FUTILITY_MARGIN * depth <= alpha) {
      return staticEval;
    }
  }

  let bestScore = -INF;
  let bestMove = orderedMoves[0];
  let moveCount = 0;
  const origAlpha = alpha;

  for (const move of orderedMoves) {
    makeMove(board, move);
    let score: number;

    if (moveCount === 0) {
      score = -negamax(
        board,
        state,
        aiPlayer,
        opponent(current),
        depth - 1,
        -beta,
        -alpha,
        ply + 1,
        startTime,
        timeLimitMs,
      );
    } else {
      // Late Move Reductions: search lower-ranked non-threat moves at reduced depth
      let reduction = 0;
      if (
        depth >= LMR_REDUCTION_LIMIT &&
        moveCount >= LMR_FULL_DEPTH_MOVES &&
        !isThreat(board, move, current)
      ) {
        reduction = 1;
        if (moveCount >= 8) reduction = 2;
      }

      score = -negamax(
        board,
        state,
        aiPlayer,
        opponent(current),
        depth - 1 - reduction,
        -alpha - 1,
        -alpha,
        ply + 1,
        startTime,
        timeLimitMs,
      );

      if (score > alpha && reduction > 0) {
        score = -negamax(
          board,
          state,
          aiPlayer,
          opponent(current),
          depth - 1,
          -beta,
          -alpha,
          ply + 1,
          startTime,
          timeLimitMs,
        );
      } else if (score > alpha && score < beta) {
        score = -negamax(
          board,
          state,
          aiPlayer,
          opponent(current),
          depth - 1,
          -beta,
          -alpha,
          ply + 1,
          startTime,
          timeLimitMs,
        );
      }
    }

    unmakeMove(board);

    if (state.aborted) return 0;

    moveCount++;

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }

    if (score > alpha) {
      alpha = score;
    }

    if (alpha >= beta) {
      // History Heuristic + Killer Move: record the cutoff move
      state.historyTable[move] += depth * depth;
      if (state.historyTable[move] > 1_000_000) {
        for (let i = 0; i < CELL_COUNT; i++) {
          state.historyTable[i] = (state.historyTable[i] / 2) | 0;
        }
      }
      if (killers[0] !== move) {
        killers[1] = killers[0];
        killers[0] = move;
      }
      break;
    }
  }

  let flag: TTFlag;
  if (bestScore <= origAlpha) {
    flag = TTFlag.UpperBound;
  } else if (bestScore >= beta) {
    flag = TTFlag.LowerBound;
  } else {
    flag = TTFlag.Exact;
  }
  ttStore(state.tt, hash, depth, bestScore, flag, bestMove);

  return bestScore;
}

function quiescence(
  board: BoardState,
  state: SearchState,
  aiPlayer: Player,
  current: Player,
  alpha: number,
  beta: number,
  ply: number,
  startTime: number,
  timeLimitMs: number,
): number {
  state.nodes++;

  if (state.aborted) return 0;
  if (performance.now() - startTime > timeLimitMs) {
    state.aborted = true;
    return 0;
  }

  const standPat = evaluateBoard(board, aiPlayer) * (current === aiPlayer ? 1 : -1);

  if (standPat >= beta) return standPat;
  if (standPat > alpha) alpha = standPat;

  if (ply > QUIESCENCE_DEPTH + MAX_DEPTH) return standPat;

  const moves = generateMoves(board);
  const threatMoves: number[] = [];

  for (const move of moves) {
    if (hasImmediateWin(board, move, current) || isThreat(board, move, current)) {
      threatMoves.push(move);
    }
  }

  for (const move of threatMoves) {
    makeMove(board, move);
    const score = -quiescence(
      board,
      state,
      aiPlayer,
      opponent(current),
      -beta,
      -alpha,
      ply + 1,
      startTime,
      timeLimitMs,
    );
    unmakeMove(board);

    if (state.aborted) return 0;
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }

  return alpha;
}

import { Player } from "./types";
import { type BoardState, makeMove, unmakeMove, opponent } from "./board";
import { createsFour, hasImmediateWin } from "./patterns";
import { generateMoves } from "./moves";

const VCF_MAX_DEPTH = 20;

/**
 * VCF（连续冲四取胜）搜索：进攻方只走"冲四/成五"强制着法，
 * 防守方每步都被迫挡四，若最终形成双四/活四（两个成五点）则进攻方必胜。
 * 返回取胜的第一手落点，无解返回 -1。
 *
 * 调用前提：当前轮到 attacker 落子（makeMove 依赖手数奇偶决定执子方）。
 */
export function vcfSearch(
  board: BoardState,
  attacker: Player,
  depth: number = VCF_MAX_DEPTH,
): number {
  return vcfAttack(board, attacker, depth);
}

/** 收集 player 落一子即成五的所有点位（不修改棋盘） */
function collectFivePoints(board: BoardState, player: Player, moves: readonly number[]): number[] {
  const points: number[] = [];
  for (const move of moves) {
    if (hasImmediateWin(board, move, player)) {
      points.push(move);
    }
  }
  return points;
}

function vcfAttack(board: BoardState, attacker: Player, depth: number): number {
  const moves = generateMoves(board);

  // 直接成五
  for (const move of moves) {
    if (hasImmediateWin(board, move, attacker)) return move;
  }

  if (depth <= 0) return -1;

  const defender = opponent(attacker);

  for (const move of moves) {
    // 只延伸冲四强制着法
    if (!createsFour(board, move, attacker)) continue;

    makeMove(board, move);

    const replyMoves = generateMoves(board);
    let win = false;

    // 轮到防守方：若防守方自己有成五点，他直接取胜，本线失败
    const defenderFives = collectFivePoints(board, defender, replyMoves);
    if (defenderFives.length === 0) {
      const attackerFives = collectFivePoints(board, attacker, replyMoves);
      if (attackerFives.length >= 2) {
        // 双四/活四：防守方无法同时挡两个成五点
        win = true;
      } else if (attackerFives.length === 1) {
        // 防守方唯一挡点被迫应手，继续连续冲四
        makeMove(board, attackerFives[0]);
        win = vcfAttack(board, attacker, depth - 2) >= 0;
        unmakeMove(board);
      }
    }

    unmakeMove(board);
    if (win) return move;
  }

  return -1;
}

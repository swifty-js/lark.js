import { Player } from "./types";
import { type BoardState, makeMove, unmakeMove, opponent } from "./board";
import { createsFour, hasImmediateWin } from "./patterns";
import { generateMoves } from "./moves";

const VCF_MAX_DEPTH = 20;

/**
 * VCF (Victory by Continuous Fours) search: the attacker plays only forcing
 * moves (fours/fives), the defender is forced to block each four. If the
 * attacker eventually creates a double-four or open-four (two winning points),
 * the attack succeeds. Returns the first winning move, or -1 if no solution.
 *
 * Precondition: it is currently the attacker's turn (makeMove relies on move
 * count parity to determine the side to move).
 */
export function vcfSearch(
  board: BoardState,
  attacker: Player,
  depth: number = VCF_MAX_DEPTH,
): number {
  return vcfAttack(board, attacker, depth);
}

/** Collect all points where player can complete five in one move (does not mutate the board) */
function collectFivePoints(
  board: BoardState,
  player: Player,
  moves: readonly number[],
): number[] {
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

  // Immediate five-in-a-row
  for (const move of moves) {
    if (hasImmediateWin(board, move, attacker)) return move;
  }

  if (depth <= 0) return -1;

  const defender = opponent(attacker);

  for (const move of moves) {
    // Only extend forcing four-threat moves
    if (!createsFour(board, move, attacker)) continue;

    makeMove(board, move);

    const replyMoves = generateMoves(board);
    let win = false;

    // Defender's turn: if the defender has an immediate five, this line fails
    const defenderFives = collectFivePoints(board, defender, replyMoves);
    if (defenderFives.length === 0) {
      const attackerFives = collectFivePoints(board, attacker, replyMoves);
      if (attackerFives.length >= 2) {
        // Double-four/open-four: defender cannot block both winning points
        win = true;
      } else if (attackerFives.length === 1) {
        // Defender forced to block the single winning point; continue the attack
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

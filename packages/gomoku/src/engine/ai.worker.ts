import { createBoard, currentPlayer, makeMove } from "./board";
import { findBestMove } from "./search";
import type { AiRequest, AiResponse } from "./protocol";

/** Run the search in a Worker thread to avoid blocking the UI main thread during deep iterative deepening */
onmessage = (event: MessageEvent<AiRequest>) => {
  const req = event.data;

  const board = createBoard();
  for (const move of req.moves) {
    makeMove(board, move);
  }

  const aiPlayer = currentPlayer(board);
  const start = performance.now();
  const result = findBestMove(board, aiPlayer, req.maxDepth, req.timeLimitMs);

  const response: AiResponse = {
    requestId: req.requestId,
    bestMove: result.bestMove,
    score: result.score,
    depth: result.depth,
    nodes: result.nodes,
    timeMs: Math.round(performance.now() - start),
  };
  postMessage(response);
};

/**
 * Copyright (c) 2026 hangtiancheng
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

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

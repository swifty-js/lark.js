/** AI Worker message protocol: type contract between the main thread and the search worker */

export interface AiRequest {
  /** Monotonically increasing request ID, used to discard stale results (after undo/new game) */
  requestId: number;
  /** Move sequence replayed from an empty board in order */
  moves: number[];
  maxDepth: number;
  timeLimitMs: number;
}

export interface AiResponse {
  requestId: number;
  bestMove: number;
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

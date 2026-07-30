/** AI Worker 消息协议：主线程与搜索 Worker 之间的类型约定 */

export interface AiRequest {
  /** 递增请求号，用于丢弃过期结果（悔棋/新对局后） */
  requestId: number;
  /** 从空棋盘按顺序重放的落子序列 */
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

// Level data as stored in JSON.

import type { Graph } from './graph';

export type ModeId = 'spread';

export interface Level {
  /** Stable id used for saved progress, e.g. "spread-07". */
  id: string;
  mode: ModeId;
  /** Graph-family name, shown subtly in the game screen. */
  name: string;
  graph: Graph;
  /** Mode-specific parameters (none needed for Spread yet). */
  params: Record<string, unknown>;
  /** Precomputed optimal number of moves. */
  par: number;
}

/** Throws if a level is structurally broken (bad edge indices, positions out of range…). */
export function validateLevel(level: Level): void {
  const n = level.graph.nodes.length;
  const ids = new Set(level.graph.nodes.map((v) => v.id));
  if (ids.size !== n) throw new Error(`${level.id}: duplicate node ids`);
  for (const v of level.graph.nodes) {
    if (!(v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1)) throw new Error(`${level.id}: node ${v.id} position outside 0–1`);
  }
  const seen = new Set<string>();
  for (const [a, b] of level.graph.edges) {
    if (a === b || a < 0 || b < 0 || a >= n || b >= n) throw new Error(`${level.id}: bad edge ${a}-${b}`);
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) throw new Error(`${level.id}: duplicate edge ${key}`);
    seen.add(key);
  }
  if (!Number.isInteger(level.par) || level.par < 1) throw new Error(`${level.id}: bad par`);
}

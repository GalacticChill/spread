// Level data as stored in JSON. Each mode has its own params and target score.

import type { Graph } from './graph';

export type ModeId = 'spread' | 'containment';

interface LevelBase {
  /** Stable id used for saved progress, e.g. "spread-07". */
  id: string;
  /** Graph-family name, shown subtly in the game screen. */
  name: string;
  graph: Graph;
}

export interface SpreadLevel extends LevelBase {
  mode: 'spread';
  params: Record<string, never>;
  /** Precomputed optimal number of moves. */
  par: number;
}

export interface ContainmentLevel extends LevelBase {
  mode: 'containment';
  /** k = protections per turn; sources = nodes that start orange. */
  params: { k: number; sources: number[] };
  /** Precomputed maximum number of nodes that can be saved. */
  optimum: number;
}

export type Level = SpreadLevel | ContainmentLevel;

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
  if (level.mode === 'spread') {
    if (!Number.isInteger(level.par) || level.par < 1) throw new Error(`${level.id}: bad par`);
  } else {
    const { k, sources } = level.params;
    if (!Number.isInteger(k) || k < 1) throw new Error(`${level.id}: bad k`);
    if (!sources.length || sources.some((s) => !Number.isInteger(s) || s < 0 || s >= n)) throw new Error(`${level.id}: bad sources`);
    if (!Number.isInteger(level.optimum) || level.optimum < 0) throw new Error(`${level.id}: bad optimum`);
  }
}

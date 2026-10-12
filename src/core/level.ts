// Level data as stored in JSON. Each mode has its own params and target score.

import type { Graph } from './graph';

export type ModeId = 'spread' | 'containment' | 'threshold' | 'rival' | 'origin' | 'wiring';

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

export interface ThresholdLevel extends LevelBase {
  mode: 'threshold';
  /** Thresholds live on the nodes (`node.threshold`, default 1). */
  params: Record<string, never>;
  /** Precomputed optimal number of moves. */
  par: number;
}

export interface RivalLevel extends LevelBase {
  mode: 'rival';
  /** blue = nodes blue starts on; budget = total orange taps. */
  params: { blue: number[]; budget: number };
  /** Precomputed maximum number of orange nodes. */
  optimum: number;
}

export interface OriginLevel extends LevelBase {
  mode: 'origin';
  params: {
    /** Number of hidden sources s. */
    size: number;
    /** Total ticks T the spread ran. */
    ticks: number;
    /** Timed levels: the first `hidden` ticks were unobserved; numbers count from there. */
    timed: boolean;
    hidden: number;
    guesses: number;
    /** The sources used to make the level (revealed if the player runs out of guesses). */
    seeds: number[];
  };
  /** How many seed sets explain the observation (any of them is accepted). */
  explanations: number;
}

export interface WiringLevel extends LevelBase {
  mode: 'wiring';
  /** graph.edges are the fixed edges. seed, tick limit T, and new-edge budget. */
  params: { seed: number; ticks: number; budget: number };
  /** Precomputed minimum number of new edges. */
  optimum: number;
}

export type Level = SpreadLevel | ContainmentLevel | ThresholdLevel | RivalLevel | OriginLevel | WiringLevel;

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
  if (level.mode === 'spread' || level.mode === 'threshold') {
    if (!Number.isInteger(level.par) || level.par < 1) throw new Error(`${level.id}: bad par`);
    if (level.mode === 'threshold') {
      for (const v of level.graph.nodes) {
        if (!Number.isInteger(v.threshold) || v.threshold! < 1) throw new Error(`${level.id}: node ${v.id} needs a threshold ≥ 1`);
      }
    }
  } else if (level.mode === 'rival') {
    const { blue, budget } = level.params;
    if (!blue.length || blue.some((b) => !Number.isInteger(b) || b < 0 || b >= n)) throw new Error(`${level.id}: bad blue`);
    if (!Number.isInteger(budget) || budget < 1) throw new Error(`${level.id}: bad budget`);
  } else if (level.mode === 'origin') {
    const { size, ticks, hidden, guesses, seeds } = level.params;
    if (seeds.length !== size || seeds.some((v) => !Number.isInteger(v) || v < 0 || v >= n)) throw new Error(`${level.id}: bad seeds`);
    if (!(ticks >= 1 && hidden >= 0 && hidden < ticks && guesses >= 1)) throw new Error(`${level.id}: bad ticks/guesses`);
    if (!(level.explanations >= 1)) throw new Error(`${level.id}: no explanation`);
  } else if (level.mode === 'wiring') {
    const { seed, ticks, budget } = level.params;
    if (!(Number.isInteger(seed) && seed >= 0 && seed < n && ticks >= 1)) throw new Error(`${level.id}: bad seed/ticks`);
    if (!(level.optimum >= 1 && budget >= level.optimum)) throw new Error(`${level.id}: bad optimum/budget`);
  } else {
    const { k, sources } = level.params;
    if (!Number.isInteger(k) || k < 1) throw new Error(`${level.id}: bad k`);
    if (!sources.length || sources.some((s) => !Number.isInteger(s) || s < 0 || s >= n)) throw new Error(`${level.id}: bad sources`);
    if (!Number.isInteger(level.optimum) || level.optimum < 0) throw new Error(`${level.id}: bad optimum`);
  }
}

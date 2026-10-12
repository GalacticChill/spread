// Par solver for Mode 1 (Spread).
//
// Orange only ever grows, so tapping a node earlier is never worse than tapping it
// later. That means some optimal play is: tap k seeds first, then tick t times. After
// t ticks a node is orange iff it is within distance t of some seed. So
//
//   optimum = min over t of ( t + γ_t )
//
// where γ_t is the distance-t domination number: the fewest seeds such that every
// node is within t hops of a seed. γ_t is a set-cover problem, which we solve exactly
// with bitmasks + iterative deepening. That is fast for the ~30-node graphs we use.

import { allPairsDistances, type Graph } from './graph';

export const MAX_SOLVER_NODES = 30;

export interface Solution {
  /** Optimal total moves (taps + ticks). */
  par: number;
  /** Number of ticks in one optimal plan. */
  ticks: number;
  /** Seeds (node indices) to tap first in that plan. */
  seeds: number[];
}

/**
 * Smallest set of seeds covering every node, where `covers[v]` is the bitmask of
 * nodes that seed v covers. Returns node indices, or null if no cover exists.
 */
export function minimumCover(covers: number[], n: number): number[] | null {
  const full = n === 0 ? 0 : (2 ** n - 1) >>> 0;
  // candidates[u] = seeds that would cover node u
  const candidates: number[][] = Array.from({ length: n }, () => []);
  covers.forEach((mask, v) => {
    for (let u = 0; u < n; u++) if (mask & (1 << u)) candidates[u].push(v);
  });
  if (candidates.some((c) => c.length === 0)) return null;

  // Try covers with more nodes first: finds solutions sooner.
  const size = covers.map(popcount);
  for (const list of candidates) list.sort((a, b) => size[b] - size[a]);
  const maxSize = Math.max(1, ...size);

  const chosen: number[] = [];
  const search = (covered: number, budget: number): boolean => {
    if (covered === full) return true;
    if (budget === 0) return false;
    // Lower bound: even the biggest cover can't finish the remainder in `budget` picks.
    if (Math.ceil(popcount(~covered & full) / maxSize) > budget) return false;
    // Branch on the lowest uncovered node: some chosen seed must cover it.
    const u = lowestBit(~covered & full);
    for (const v of candidates[u]) {
      chosen.push(v);
      if (search((covered | covers[v]) >>> 0, budget - 1)) return true;
      chosen.pop();
    }
    return false;
  };

  // Iterative deepening: the first budget that succeeds is the minimum.
  for (let budget = 0; budget <= n; budget++) {
    if (search(0, budget)) return chosen.slice();
  }
  return null;
}

/** Minimum seeds so that every node is within distance t of a seed. */
export function distanceDominatingSet(graph: Graph, t: number, dist = allPairsDistances(graph)): number[] | null {
  const n = graph.nodes.length;
  checkSize(n);
  const covers = dist.map((row) => row.reduce((mask, d, u) => (d <= t ? (mask | (1 << u)) >>> 0 : mask), 0));
  return minimumCover(covers, n);
}

/** Optimal plan and par for a Spread level. */
export function solveSpread(graph: Graph): Solution {
  const n = graph.nodes.length;
  checkSize(n);
  if (n === 0) return { par: 0, ticks: 0, seeds: [] };
  const dist = allPairsDistances(graph);

  let best: Solution = { par: n, ticks: 0, seeds: graph.nodes.map((_, i) => i) }; // t = 0: tap everything
  // Beyond t = n-1 nothing new is reachable, and t >= best.par can't improve on best.
  for (let t = 1; t < Math.min(n, best.par); t++) {
    const seeds = distanceDominatingSet(graph, t, dist);
    if (seeds && t + seeds.length < best.par) best = { par: t + seeds.length, ticks: t, seeds };
  }
  return best;
}

function checkSize(n: number) {
  if (n > MAX_SOLVER_NODES) throw new Error(`Solver supports at most ${MAX_SOLVER_NODES} nodes (got ${n}).`);
}

function popcount(x: number): number {
  x = x >>> 0;
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

function lowestBit(x: number): number {
  return 31 - Math.clz32(x & -x);
}

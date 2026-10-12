// Par solver for Mode 3 (Threshold).
//
// Activation is monotone: a bigger orange set never activates fewer nodes. So, as in
// Spread, tapping early is never worse, and some optimal play taps all seeds first,
// then ticks. The optimum is
//
//   min over seed sets S of ( |S| + ticks needed for S to turn everything orange ).
//
// For each tick budget t we find the fewest seeds that fill the graph within t ticks
// (m(t)), and take min over t of t + m(t). m(t) comes from a depth-first search that
// decides node by node "seed or not", pruned with a monotone bound: if seeding EVERY
// still-undecided node can't fill the graph in t ticks, no completion of this branch can.

import { adjacency, type Graph } from './graph';
import { thresholdOf } from './threshold';

export const MAX_THRESHOLD_NODES = 30;

export interface ThresholdSolution {
  par: number;
  ticks: number;
  seeds: number[];
}

export function solveThreshold(graph: Graph): ThresholdSolution {
  const n = graph.nodes.length;
  if (n > MAX_THRESHOLD_NODES) throw new Error(`Threshold solver supports at most ${MAX_THRESHOLD_NODES} nodes (got ${n}).`);
  if (n === 0) return { par: 0, ticks: 0, seeds: [] };
  const adj = adjacency(graph);
  const adjMask = adj.map((list) => list.reduce((m, v) => (m | (1 << v)) >>> 0, 0));
  const r = graph.nodes.map((_, v) => thresholdOf(graph, v));
  const full = (2 ** n - 1) >>> 0;

  /** Orange set after up to t ticks from `seeds` (stops early once nothing changes). */
  const closure = (seeds: number, t: number) => {
    let orange = seeds;
    for (let step = 0; step < t && orange !== full; step++) {
      let next = orange;
      for (let v = 0; v < n; v++) {
        if (!(orange & (1 << v)) && popcount(adjMask[v] & orange) >= r[v]) next = (next | (1 << v)) >>> 0;
      }
      if (next === orange) break;
      orange = next;
    }
    return orange;
  };

  // Nodes that can never be activated by neighbors (r > degree) must be seeds.
  const forced = r.reduce((m, rv, v) => (rv > adj[v].length ? (m | (1 << v)) >>> 0 : m), 0);
  // Decide likely seeds first: high threshold relative to degree.
  const order = graph.nodes
    .map((_, v) => v)
    .filter((v) => !(forced & (1 << v)))
    .sort((a, b) => r[b] / (adj[b].length || 1) - r[a] / (adj[a].length || 1) || r[b] - r[a]);
  // suffix[i] = mask of order[i..]
  const suffix = new Array<number>(order.length + 1).fill(0);
  for (let i = order.length - 1; i >= 0; i--) suffix[i] = (suffix[i + 1] | (1 << order[i])) >>> 0;

  /** Smallest seed set (≤ budget) that fills the graph within t ticks, or null. */
  const fewestSeeds = (t: number, budget: number): number | null => {
    let found: number | null = null;
    const dfs = (i: number, chosen: number, count: number, limit: number): boolean => {
      if (closure(chosen, t) === full) {
        found = chosen;
        return true;
      }
      if (count === limit || i === order.length) return false;
      // Monotone bound: even seeding all undecided nodes fails → prune.
      if (closure((chosen | suffix[i]) >>> 0, t) !== full) return false;
      return dfs(i + 1, (chosen | (1 << order[i])) >>> 0, count + 1, limit) || dfs(i + 1, chosen, count, limit);
    };
    // Iterative deepening on the number of seeds, so the first hit is the minimum.
    const base = popcount(forced);
    for (let limit = base; limit <= budget; limit++) {
      if (dfs(0, forced, base, limit)) return found;
    }
    return null;
  };

  let best: ThresholdSolution = { par: n, ticks: 0, seeds: graph.nodes.map((_, v) => v) };
  // At least one seed is always needed, so t ticks cost at least t + 1 moves.
  for (let t = 1; t + 1 < best.par; t++) {
    // Only interested in seed counts that would beat the current best.
    const seeds = fewestSeeds(t, best.par - t - 1);
    if (seeds !== null) best = { par: t + popcount(seeds), ticks: t, seeds: bits(seeds) };
  }
  return best;
}

function bits(mask: number): number[] {
  const out: number[] = [];
  for (let m = mask >>> 0; m; m &= m - 1) out.push(31 - Math.clz32(m & -m));
  return out;
}

function popcount(x: number): number {
  let c = 0;
  for (let m = x >>> 0; m; m &= m - 1) c++;
  return c;
}

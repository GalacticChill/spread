// Optimal solver for Mode 2 (Containment / firefighter).
//
// Exhaustive search with memoization. Two facts keep the state space small:
//
// 1. Protecting is never harmful (a protected node is saved and can only block
//    orange), so each turn we protect exactly min(k, threatened) nodes.
// 2. After a tick, only the nodes that JUST turned orange (the "front") can spread
//    further: older orange nodes have no free neighbors left. And free nodes that
//    orange can no longer reach are safe forever, whatever happens. So the future
//    depends only on (front, threatened), where "threatened" = free nodes still
//    reachable from the front without crossing protected or orange nodes.
//
// We memoize the minimum number of future burns for each (front, threatened) pair.
// Bitmasks limit graphs to 30 nodes; levels are kept small enough to solve quickly.

import { adjacency, type Graph } from './graph';

export const MAX_CONTAINMENT_NODES = 30;

export interface ContainmentSolution {
  /** Maximum number of nodes that can be saved. */
  optimum: number;
  /** One optimal plan: the nodes to protect on each turn. */
  plan: number[][];
}

export function solveContainment(graph: Graph, sources: number[], k: number): ContainmentSolution {
  const n = graph.nodes.length;
  if (n > MAX_CONTAINMENT_NODES) throw new Error(`Containment solver supports at most ${MAX_CONTAINMENT_NODES} nodes (got ${n}).`);
  const adjMask = adjacency(graph).map((list) => list.reduce((m, v) => (m | (1 << v)) >>> 0, 0));
  const neighbors = (mask: number) => {
    let out = 0;
    for (let m = mask; m; m &= m - 1) out = (out | adjMask[lowestBit(m)]) >>> 0;
    return out;
  };
  /** Free nodes reachable from `front` while staying inside `allowed`. */
  const reachable = (front: number, allowed: number) => {
    let seen = 0;
    let frontier = (neighbors(front) & allowed) >>> 0;
    while (frontier) {
      seen = (seen | frontier) >>> 0;
      frontier = (neighbors(frontier) & allowed & ~seen) >>> 0;
    }
    return seen;
  };

  const sourceMask = sources.reduce((m, v) => (m | (1 << v)) >>> 0, 0);
  const free = (2 ** n - 1 - sourceMask) >>> 0;
  const memo = new Map<string, { burns: number; protect: number }>();

  // Minimum number of nodes that will still turn orange, playing optimally.
  const best = (front: number, threatened: number): number => {
    if (!threatened) return 0;
    const key = `${front}:${threatened}`;
    const hit = memo.get(key);
    if (hit) return hit.burns;

    let result = { burns: Infinity, protect: 0 };
    if (popcount(threatened) <= k) {
      result = { burns: 0, protect: threatened }; // protect everything still in danger
    } else {
      forEachSubset(threatened, k, (protect) => {
        if (result.burns === 0) return; // can't beat zero
        const open = (threatened & ~protect) >>> 0;
        const burned = (neighbors(front) & open) >>> 0;
        const burns = burned ? popcount(burned) + best(burned, reachable(burned, (open & ~burned) >>> 0)) : 0;
        if (burns < result.burns) result = { burns, protect };
      });
    }
    memo.set(key, result);
    return result.burns;
  };

  const threatened0 = reachable(sourceMask, free);
  const burns = best(sourceMask, threatened0);

  // Rebuild one optimal plan by following the memoized choices.
  const plan: number[][] = [];
  let front = sourceMask;
  let threatened = threatened0;
  while (threatened) {
    const { protect } = memo.get(`${front}:${threatened}`)!;
    plan.push(bits(protect));
    const open = (threatened & ~protect) >>> 0;
    const burned = (neighbors(front) & open) >>> 0;
    if (!burned) break;
    front = burned;
    threatened = reachable(burned, (open & ~burned) >>> 0);
  }

  return { optimum: n - sources.length - burns, plan };
}

/** Calls fn for every subset of `mask` with exactly `size` bits. */
function forEachSubset(mask: number, size: number, fn: (subset: number) => void) {
  const items = bits(mask);
  const pick = (start: number, left: number, acc: number) => {
    if (left === 0) return fn(acc);
    for (let i = start; i <= items.length - left; i++) pick(i + 1, left - 1, (acc | (1 << items[i])) >>> 0);
  };
  pick(0, size, 0);
}

function bits(mask: number): number[] {
  const out: number[] = [];
  for (let m = mask >>> 0; m; m &= m - 1) out.push(lowestBit(m));
  return out;
}

function popcount(x: number): number {
  let c = 0;
  for (let m = x >>> 0; m; m &= m - 1) c++;
  return c;
}

function lowestBit(x: number): number {
  return 31 - Math.clz32(x & -x);
}

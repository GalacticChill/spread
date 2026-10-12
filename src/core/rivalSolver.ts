// Optimal solver for Mode 4 (Rival).
//
// Claim: tapping a node earlier is never worse than tapping it later. With more orange
// earlier, orange reaches every node at least as early and blue at most as early (orange
// and gray nodes only block blue), so every node ends up at least as good for orange.
// Any node tapped later was also uncolored at the start, so some optimal play spends
// all taps before the first tick, and using every tap never hurts. The search is then
// exhaustive over seed sets of size min(budget, free nodes). The brute-force test in
// tests/rival.test.ts checks this against every interleaving of taps and ticks.

import { adjacency, type Graph } from './graph';
import { FREE, initialState, orangeCount, runToEnd, tap } from './rival';

export interface RivalSolution {
  /** Most orange nodes achievable. */
  optimum: number;
  /** One optimal set of nodes to tap before the first tick. */
  seeds: number[];
}

export function solveRival(graph: Graph, blue: number[], budget: number): RivalSolution {
  const adj = adjacency(graph);
  const start = initialState(graph, blue, budget);
  const free = start.status.flatMap((st, v) => (st === FREE ? [v] : []));
  const size = Math.min(budget, free.length);
  let best: RivalSolution = { optimum: -1, seeds: [] };

  const pick = (from: number, chosen: number[]) => {
    if (chosen.length === size) {
      let s = start;
      for (const v of chosen) s = tap(s, v);
      const score = orangeCount(runToEnd(graph, s, adj));
      if (score > best.optimum) best = { optimum: score, seeds: chosen.slice() };
      return;
    }
    for (let i = from; i <= free.length - (size - chosen.length); i++) {
      chosen.push(free[i]);
      pick(i + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);
  return best;
}

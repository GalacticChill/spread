// Exact solver for Mode 6 (Wiring): fewest new edges so that every node is within
// T hops of the seed.
//
// Iterative deepening on the number of new edges k, so the first solution found is a
// minimum. Branching rule: take a node v that is still too far. In any solution, v's
// shortest path from the seed uses at least one of the edges we have yet to add; let
// (x, y) be the LAST such edge on that path, with y on v's side. The rest of the path,
// y → v, only uses edges that already exist, so y is within T − 1 hops of v in the
// current network. So we branch over y in that ball and x anywhere else, which is
// complete and far smaller than trying all pairs. Edge sets already tried in another
// order are skipped.

import { adjacency, type Graph } from './graph';
import { bfs, type Edge, type WiringParams } from './wiring';

export interface WiringSolution {
  optimum: number;
  edges: Edge[];
}

export function solveWiring(graph: Graph, p: Pick<WiringParams, 'seed' | 'ticks'>, maxEdges = graph.nodes.length): WiringSolution {
  const n = graph.nodes.length;
  const baseAdj = adjacency(graph);
  const has = (adj: number[][], a: number, b: number) => adj[a].includes(b);

  for (let k = 0; k <= maxEdges; k++) {
    const seen = new Set<string>();
    const added: Edge[] = [];
    const search = (adj: number[][]): boolean => {
      const dist = bfs(adj, p.seed);
      // Farthest unreached node: the most constrained one to branch on.
      let v = -1;
      dist.forEach((d, u) => {
        if (d > p.ticks && (v < 0 || d > dist[v])) v = u;
      });
      if (v < 0) return true;
      if (added.length === k) return false;
      const fromV = bfs(adj, v);
      for (let y = 0; y < n; y++) {
        if (fromV[y] > p.ticks - 1) continue;
        // Try the seed first: shortcuts from the seed are often best.
        const xs = [p.seed, ...Array.from({ length: n }, (_, i) => i).filter((i) => i !== p.seed)];
        for (const x of xs) {
          if (x === y || has(adj, x, y)) continue;
          const sig = [...added, [x, y] as Edge].map(([a, b]) => (a < b ? a * n + b : b * n + a)).sort((a, b) => a - b).join(',');
          if (seen.has(sig)) continue;
          seen.add(sig);
          added.push([x, y]);
          const next = adj.map((list) => list.slice());
          next[x].push(y);
          next[y].push(x);
          if (search(next)) return true;
          added.pop();
        }
      }
      return false;
    };
    if (search(baseAdj)) return { optimum: k, edges: added.slice() };
  }
  throw new Error('no solution within maxEdges');
}

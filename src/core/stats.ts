// Basic graph statistics for the Sandbox.

import { allPairsDistances, adjacency, type Graph } from './graph';

export interface GraphStats {
  nodes: number;
  edges: number;
  /** Degrees, largest first. */
  degrees: number[];
  components: number;
  connected: boolean;
  /** Longest shortest path; Infinity if disconnected, 0 for 0–1 nodes. */
  diameter: number;
}

export function graphStats(graph: Graph): GraphStats {
  const n = graph.nodes.length;
  const adj = adjacency(graph);
  const degrees = adj.map((list) => list.length).sort((a, b) => b - a);
  // Count components with a simple flood fill.
  const seen = new Array<boolean>(n).fill(false);
  let components = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    components++;
    const stack = [s];
    seen[s] = true;
    while (stack.length) {
      for (const v of adj[stack.pop()!]) {
        if (!seen[v]) {
          seen[v] = true;
          stack.push(v);
        }
      }
    }
  }
  const connected = components <= 1;
  let diameter = 0;
  if (!connected) diameter = Infinity;
  else for (const row of allPairsDistances(graph)) for (const d of row) diameter = Math.max(diameter, d);
  return { nodes: n, edges: graph.edges.length, degrees, components, connected, diameter };
}

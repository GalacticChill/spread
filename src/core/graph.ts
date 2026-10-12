// Graph types and basic algorithms. Pure: no DOM, no storage.

export interface GraphNode {
  id: string;
  /** Position normalized to 0–1; the renderer scales it to the screen. */
  x: number;
  y: number;
  /** Optional per-node attributes for later modes (e.g. threshold). */
  threshold?: number;
  [attr: string]: unknown;
}

export interface Graph {
  nodes: GraphNode[];
  /** Undirected edges as pairs of node indices. */
  edges: [number, number][];
}

/** Adjacency lists, indexed by node index. */
export function adjacency(graph: Graph): number[][] {
  const adj: number[][] = graph.nodes.map(() => []);
  for (const [a, b] of graph.edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  return adj;
}

/** BFS hop distances from `source`; unreachable nodes get Infinity. */
export function bfsDistances(graph: Graph, source: number, adj = adjacency(graph)): number[] {
  const dist = graph.nodes.map(() => Infinity);
  dist[source] = 0;
  const queue = [source];
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head];
    for (const v of adj[u]) {
      if (dist[v] === Infinity) {
        dist[v] = dist[u] + 1;
        queue.push(v);
      }
    }
  }
  return dist;
}

/** All-pairs hop distances (n BFS runs; fine for small puzzle graphs). */
export function allPairsDistances(graph: Graph): number[][] {
  const adj = adjacency(graph);
  return graph.nodes.map((_, i) => bfsDistances(graph, i, adj));
}

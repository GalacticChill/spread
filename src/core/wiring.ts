// Mode 6 (Wiring) rules: network design.
//
// The player gets nodes, maybe some fixed edges, one seed, a tick limit T and an edge
// budget. They add edges between any two nodes (and can remove the ones they added).
// Goal: every node within T ticks of the seed (Spread rules, r = 1), using as few new
// edges as possible. A test run ticks the spread from the seed over the current
// network; editing the network resets the run.

import { adjacency, type Graph } from './graph';

export type Edge = [number, number];

export interface WiringState {
  readonly added: readonly Edge[];
  /** The current test run: which nodes are orange, and how many ticks it has run. */
  readonly orange: readonly boolean[];
  readonly ticks: number;
}

export interface WiringParams {
  seed: number;
  /** Tick limit T. */
  ticks: number;
  /** Maximum number of new edges. */
  budget: number;
}

const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** The graph with the player's edges added. */
export function wiredGraph(graph: Graph, added: readonly Edge[]): Graph {
  return { nodes: graph.nodes, edges: [...graph.edges, ...added.map(([a, b]) => [a, b] as Edge)] };
}

function freshRun(graph: Graph, seed: number): boolean[] {
  return graph.nodes.map((_, v) => v === seed);
}

export function initialState(graph: Graph, p: WiringParams): WiringState {
  return { added: [], orange: freshRun(graph, p.seed), ticks: 0 };
}

/** Add an edge a–b if it's new and within budget. Resets the test run. */
export function addEdge(graph: Graph, state: WiringState, a: number, b: number, p: WiringParams): WiringState {
  if (a === b || state.added.length >= p.budget) return state;
  const k = key(a, b);
  if (graph.edges.some(([x, y]) => key(x, y) === k) || state.added.some(([x, y]) => key(x, y) === k)) return state;
  return { added: [...state.added, [a, b]], orange: freshRun(graph, p.seed), ticks: 0 };
}

/** Remove the i-th added edge (fixed edges can't be removed). Resets the test run. */
export function removeEdge(graph: Graph, state: WiringState, index: number, p: WiringParams): WiringState {
  if (index < 0 || index >= state.added.length) return state;
  return { added: state.added.filter((_, i) => i !== index), orange: freshRun(graph, p.seed), ticks: 0 };
}

/** One tick of the test run over the wired network. No-op once T ticks have run. */
export function tick(graph: Graph, state: WiringState, p: WiringParams): { state: WiringState; paths: Edge[] } {
  if (state.ticks >= p.ticks || state.orange.every(Boolean)) return { state, paths: [] };
  const adj = adjacency(wiredGraph(graph, state.added));
  const orange = state.orange.slice();
  const paths: Edge[] = [];
  state.orange.forEach((on, u) => {
    if (!on) return;
    for (const v of adj[u]) {
      if (state.orange[v]) continue;
      paths.push([u, v]);
      orange[v] = true;
    }
  });
  return { state: { ...state, orange, ticks: state.ticks + 1 }, paths };
}

/** Solved when the test run has turned every node orange (necessarily within T ticks). */
export function isSolved(state: WiringState): boolean {
  return state.orange.every(Boolean);
}

/** Nodes farther than T from the seed in the current network (for hints and the solver). */
export function unreached(graph: Graph, added: readonly Edge[], p: WiringParams): number[] {
  const dist = bfs(adjacency(wiredGraph(graph, added)), p.seed);
  return dist.flatMap((d, v) => (d > p.ticks ? [v] : []));
}

/** Stars: 3 for the minimum number of new edges, 2 for one more, 1 otherwise. */
export function wiringStars(edges: number, optimum: number): 1 | 2 | 3 {
  if (edges <= optimum) return 3;
  if (edges === optimum + 1) return 2;
  return 1;
}

export function bfs(adj: number[][], source: number): number[] {
  const dist = adj.map(() => Infinity);
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

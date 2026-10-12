// Mode 3 (Threshold) rules: bootstrap percolation / target set selection.
// Same as Spread (taps and ticks, both one move), except each node has a threshold r:
// on a tick an uncolored node turns orange only if at least r of its neighbors are
// orange. Spread is the special case where every r = 1. Taps reuse spread.ts.

import { adjacency, type Graph } from './graph';
import type { SpreadState, TickResult } from './spread';

/** A node's threshold; nodes without one behave like Spread (r = 1). */
export function thresholdOf(graph: Graph, node: number): number {
  return graph.nodes[node].threshold ?? 1;
}

/**
 * Tick: every uncolored node with at least r orange neighbors (counted in the OLD
 * state) turns orange. Costs one move even if nothing changes. Does nothing once
 * every node is orange.
 */
export function thresholdTick(graph: Graph, state: SpreadState, adj = adjacency(graph)): TickResult {
  if (state.orange.every(Boolean)) return { state, newlyOrange: [], paths: [] };
  const orange = state.orange.slice();
  const newlyOrange: number[] = [];
  const paths: [number, number][] = [];
  state.orange.forEach((isOrange, v) => {
    if (isOrange) return;
    const lit = adj[v].filter((u) => state.orange[u]);
    if (lit.length < thresholdOf(graph, v)) return;
    orange[v] = true;
    newlyOrange.push(v);
    for (const u of lit) paths.push([u, v]); // every neighbor that pushed it over
  });
  return { state: { orange, moves: state.moves + 1 }, newlyOrange, paths };
}

/** Orange neighbors of each node, for showing progress toward thresholds. */
export function litNeighbors(graph: Graph, state: SpreadState, adj = adjacency(graph)): number[] {
  return graph.nodes.map((_, v) => adj[v].filter((u) => state.orange[u]).length);
}

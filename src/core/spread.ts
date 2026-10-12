// Mode 1 (Spread) rules as pure functions over a graph and an immutable state.

import { adjacency, type Graph } from './graph';

export interface SpreadState {
  /** orange[i] is true when node i is orange. */
  readonly orange: readonly boolean[];
  /** Total moves so far (taps + ticks). */
  readonly moves: number;
}

/** What a tick changed, so the renderer can animate the ripple. */
export interface TickResult {
  state: SpreadState;
  /** Nodes that turned orange this tick. */
  newlyOrange: number[];
  /** Edges the spread travelled along this tick: [from orange node, to new node]. */
  paths: [number, number][];
}

export function initialState(graph: Graph): SpreadState {
  return { orange: graph.nodes.map(() => false), moves: 0 };
}

export function isComplete(state: SpreadState): boolean {
  return state.orange.every(Boolean);
}

/**
 * Tap a node: an uncolored node turns orange for one move. Tapping an orange node,
 * or tapping after the puzzle is complete, does nothing (returns the same state).
 */
export function tap(state: SpreadState, node: number): SpreadState {
  if (state.orange[node] || isComplete(state)) return state;
  const orange = state.orange.slice();
  orange[node] = true;
  return { orange, moves: state.moves + 1 };
}

/**
 * Tick: every node adjacent to an orange node turns orange. Costs one move even if
 * nothing changes. Does nothing once the puzzle is complete.
 */
export function tick(graph: Graph, state: SpreadState, adj = adjacency(graph)): TickResult {
  if (isComplete(state)) return { state, newlyOrange: [], paths: [] };
  const orange = state.orange.slice();
  const newlyOrange: number[] = [];
  const paths: [number, number][] = [];
  state.orange.forEach((isOrange, u) => {
    if (!isOrange) return;
    for (const v of adj[u]) {
      // Check the OLD state so spread moves exactly one hop per tick.
      if (state.orange[v]) continue;
      paths.push([u, v]);
      if (!orange[v]) {
        orange[v] = true;
        newlyOrange.push(v);
      }
    }
  });
  return { state: { orange, moves: state.moves + 1 }, newlyOrange, paths };
}

/** Stars: 3 for matching (or beating) par, 2 for par+1, 1 for completing. */
export function starsFor(moves: number, par: number): 1 | 2 | 3 {
  if (moves <= par) return 3;
  if (moves === par + 1) return 2;
  return 1;
}

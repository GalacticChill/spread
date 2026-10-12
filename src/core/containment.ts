// Mode 2 (Containment) rules: the firefighter problem (Hartnell, 1995).
// Pure functions over a graph and an immutable state.
//
// Orange starts on the source nodes. Each turn the player protects up to k uncolored
// nodes (they turn gray and can never become orange), then ticks: orange spreads to
// every unprotected neighbor. The game ends when orange can no longer spread.
// Score = nodes saved (not orange).

import { adjacency, type Graph } from './graph';
import type { TickResult as SpreadTickResult } from './spread';

export const FREE = 0;
export const ORANGE = 1;
export const PROTECTED = 2;
export type NodeStatus = typeof FREE | typeof ORANGE | typeof PROTECTED;

export interface ContainmentState {
  readonly status: readonly NodeStatus[];
  /** Nodes protected during the current turn. They can be taken back until the tick. */
  readonly placed: readonly number[];
  /** Protections allowed per turn. */
  readonly k: number;
  /** Ticks so far. */
  readonly turn: number;
}

export interface ContainmentTickResult extends Omit<SpreadTickResult, 'state'> {
  state: ContainmentState;
}

export function initialState(graph: Graph, sources: number[], k: number): ContainmentState {
  const status: NodeStatus[] = graph.nodes.map(() => FREE);
  for (const s of sources) status[s] = ORANGE;
  return { status, placed: [], k, turn: 0 };
}

/** True while some orange node still has an unprotected, uncolored neighbor. */
export function canSpread(graph: Graph, state: ContainmentState, adj = adjacency(graph)): boolean {
  return state.status.some((st, u) => st === ORANGE && adj[u].some((v) => state.status[v] === FREE));
}

export function isOver(graph: Graph, state: ContainmentState, adj = adjacency(graph)): boolean {
  return !canSpread(graph, state, adj);
}

/** Protections still available this turn. */
export function shieldsLeft(state: ContainmentState): number {
  return state.k - state.placed.length;
}

/**
 * Tap a node: protects an uncolored node if shields remain this turn, or takes back a
 * protection placed this turn. Anything else (orange node, earlier protection, game
 * over, no shields left) returns the same state.
 */
export function toggleProtect(graph: Graph, state: ContainmentState, node: number, adj = adjacency(graph)): ContainmentState {
  if (isOver(graph, state, adj)) return state;
  const status = state.status.slice();
  if (state.placed.includes(node)) {
    status[node] = FREE;
    return { ...state, status, placed: state.placed.filter((v) => v !== node) };
  }
  if (state.status[node] !== FREE || shieldsLeft(state) <= 0) return state;
  status[node] = PROTECTED;
  return { ...state, status, placed: [...state.placed, node] };
}

/** Tick: orange spreads to every unprotected neighbor; protections become permanent. */
export function tick(graph: Graph, state: ContainmentState, adj = adjacency(graph)): ContainmentTickResult {
  if (isOver(graph, state, adj)) return { state, newlyOrange: [], paths: [] };
  const status = state.status.slice();
  const newlyOrange: number[] = [];
  const paths: [number, number][] = [];
  state.status.forEach((st, u) => {
    if (st !== ORANGE) return;
    for (const v of adj[u]) {
      if (state.status[v] !== FREE) continue; // read the OLD state: one hop per tick
      paths.push([u, v]);
      if (status[v] !== ORANGE) {
        status[v] = ORANGE;
        newlyOrange.push(v);
      }
    }
  });
  return { state: { ...state, status, placed: [], turn: state.turn + 1 }, newlyOrange, paths };
}

/** Nodes that are not orange. */
export function savedCount(state: ContainmentState): number {
  return state.status.filter((st) => st !== ORANGE).length;
}

/** Stars: 3 for the optimum, 2 for one node short, 1 for finishing. */
export function containmentStars(saved: number, optimum: number): 1 | 2 | 3 {
  if (saved >= optimum) return 3;
  if (saved === optimum - 1) return 2;
  return 1;
}

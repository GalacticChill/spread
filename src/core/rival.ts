// Mode 4 (Rival) rules: competitive diffusion against a deterministic opponent.
// Pure functions over a graph and an immutable state.
//
// Blue starts on given nodes. Between ticks the player may tap uncolored nodes to make
// them orange, up to a total budget. On a tick both colors spread at once: an uncolored
// node next to orange only turns orange, next to blue only turns blue, and next to
// both turns gray (contested, blocked). Colored nodes never change. Score = orange nodes.

import { adjacency, type Graph } from './graph';

export const FREE = 0;
export const ORANGE = 1;
export const BLUE = 2;
export const GRAY = 3;
export type RivalStatus = typeof FREE | typeof ORANGE | typeof BLUE | typeof GRAY;

export interface RivalState {
  readonly status: readonly RivalStatus[];
  /** Orange taps still available. */
  readonly tapsLeft: number;
  readonly ticks: number;
}

export interface RivalTickResult {
  state: RivalState;
  /** Edges the colors travelled along this tick: [from colored node, to newly colored node]. */
  paths: [number, number][];
}

export function initialState(graph: Graph, blue: number[], budget: number): RivalState {
  const status: RivalStatus[] = graph.nodes.map(() => FREE);
  for (const b of blue) status[b] = BLUE;
  return { status, tapsLeft: budget, ticks: 0 };
}

/** Tap an uncolored node to make it orange (uses one tap). Otherwise returns the same state. */
export function tap(state: RivalState, node: number): RivalState {
  if (state.status[node] !== FREE || state.tapsLeft <= 0) return state;
  const status = state.status.slice();
  status[node] = ORANGE;
  return { ...state, status, tapsLeft: state.tapsLeft - 1 };
}

/** True while a tick would still color something. */
export function canSpread(graph: Graph, state: RivalState, adj = adjacency(graph)): boolean {
  return state.status.some((st, v) => st === FREE && adj[v].some((u) => state.status[u] === ORANGE || state.status[u] === BLUE));
}

/** The game is over when nothing can change: no spread possible and no useful taps left. */
export function isOver(graph: Graph, state: RivalState, adj = adjacency(graph)): boolean {
  if (canSpread(graph, state, adj)) return false;
  return state.tapsLeft === 0 || !state.status.includes(FREE);
}

export function tick(graph: Graph, state: RivalState, adj = adjacency(graph)): RivalTickResult {
  const status = state.status.slice();
  const paths: [number, number][] = [];
  state.status.forEach((st, v) => {
    if (st !== FREE) return;
    // Read the OLD state so both colors move exactly one hop per tick.
    const fromOrange = adj[v].filter((u) => state.status[u] === ORANGE);
    const fromBlue = adj[v].filter((u) => state.status[u] === BLUE);
    if (!fromOrange.length && !fromBlue.length) return;
    status[v] = fromOrange.length && fromBlue.length ? GRAY : fromOrange.length ? ORANGE : BLUE;
    for (const u of [...fromOrange, ...fromBlue]) paths.push([u, v]);
  });
  return { state: { ...state, status, ticks: state.ticks + 1 }, paths };
}

export function orangeCount(state: RivalState): number {
  return state.status.filter((st) => st === ORANGE).length;
}

/** Stars: 3 for the optimum, 2 for one short, 1 for finishing. */
export function rivalStars(orange: number, optimum: number): 1 | 2 | 3 {
  if (orange >= optimum) return 3;
  if (orange === optimum - 1) return 2;
  return 1;
}

/** Play out the rest of the game with no more taps (used by the solver). */
export function runToEnd(graph: Graph, state: RivalState, adj = adjacency(graph)): RivalState {
  let s = state;
  while (canSpread(graph, s, adj)) s = tick(graph, s, adj).state;
  return s;
}

// Mode 5 (Origin) rules: source identification ("patient zero").
//
// The player sees the result of a Spread run (every r = 1) from an unknown seed set of
// known size s: which nodes are orange after T ticks. In timed levels the first h of
// those ticks happened unobserved, and each orange node shows when it turned orange
// counting from the start of observation (0 = already orange at tick h). The player
// picks s suspected sources and submits. ANY seed set that reproduces the observation
// exactly is accepted. Guesses are limited; a wrong guess reveals which nodes it would
// color incorrectly.

import { adjacency, type Graph } from './graph';

/** What the player is shown. `times[v]` is null for nodes that are not orange. */
export interface Observation {
  ticks: number;
  /** Unobserved ticks at the start (timed levels only; 0 means untimed). */
  hidden: number;
  timed: boolean;
  times: (number | null)[];
}

/** Hop distance from the nearest seed (multi-source BFS). Infinity if unreachable. */
export function distancesFrom(graph: Graph, seeds: number[], adj = adjacency(graph)): number[] {
  const dist = graph.nodes.map(() => Infinity);
  const queue = [...seeds];
  for (const s of seeds) dist[s] = 0;
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

/** What spreading from `seeds` for `ticks` ticks would show. */
export function observe(graph: Graph, seeds: number[], ticks: number, hidden = 0, timed = false, adj = adjacency(graph)): Observation {
  const dist = distancesFrom(graph, seeds, adj);
  return { ticks, hidden, timed, times: dist.map((d) => (d <= ticks ? (timed ? Math.max(0, d - hidden) : 0) : null)) };
}

/** Nodes where the guess's spread differs from the observation (empty = correct). */
export function wrongNodes(graph: Graph, guess: number[], obs: Observation, adj = adjacency(graph)): number[] {
  const mine = observe(graph, guess, obs.ticks, obs.hidden, obs.timed, adj).times;
  return obs.times.flatMap((t, v) => (t === mine[v] ? [] : [v]));
}

export interface OriginState {
  readonly selected: readonly number[];
  readonly guessesLeft: number;
  readonly solved: boolean;
  /** Nodes the last wrong guess would color incorrectly. */
  readonly wrong: readonly number[];
  readonly guessesUsed: number;
}

export function initialState(guesses: number): OriginState {
  return { selected: [], guessesLeft: guesses, solved: false, wrong: [], guessesUsed: 0 };
}

export function isOver(state: OriginState): boolean {
  return state.solved || state.guessesLeft === 0;
}

/**
 * Tap a node to select or deselect it as a suspected source. Only orange nodes can be
 * sources, and at most s can be selected. Returns the same state if the tap does nothing.
 */
export function toggleSelect(state: OriginState, node: number, obs: Observation, s: number): OriginState {
  if (isOver(state)) return state;
  if (state.selected.includes(node)) return { ...state, selected: state.selected.filter((v) => v !== node) };
  if (obs.times[node] === null || state.selected.length >= s) return state;
  return { ...state, selected: [...state.selected, node] };
}

/** Submit the current selection. Needs exactly s nodes selected. */
export function submit(graph: Graph, state: OriginState, obs: Observation, s: number, adj = adjacency(graph)): OriginState {
  if (isOver(state) || state.selected.length !== s) return state;
  const wrong = wrongNodes(graph, [...state.selected], obs, adj);
  return {
    ...state,
    solved: wrong.length === 0,
    wrong,
    guessesLeft: wrong.length === 0 ? state.guessesLeft : state.guessesLeft - 1,
    guessesUsed: state.guessesUsed + 1,
  };
}

/** Stars by guesses used: 3 for the first, 2 for the second, 1 after that. */
export function originStars(guessesUsed: number): 1 | 2 | 3 {
  return guessesUsed <= 1 ? 3 : guessesUsed === 2 ? 2 : 1;
}

/** Every seed set of size s that reproduces the observation (for level design and tests). */
export function allExplanations(graph: Graph, obs: Observation, s: number): number[][] {
  const adj = adjacency(graph);
  const candidates = obs.times.flatMap((t, v) => (t === null ? [] : [v]));
  const out: number[][] = [];
  const pick = (from: number, chosen: number[]) => {
    if (chosen.length === s) {
      if (wrongNodes(graph, chosen, obs, adj).length === 0) out.push(chosen.slice());
      return;
    }
    for (let i = from; i <= candidates.length - (s - chosen.length); i++) {
      chosen.push(candidates[i]);
      pick(i + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);
  return out;
}

import { describe, expect, it } from 'vitest';
import { adjacency, type Graph } from '../src/core/graph';
import { complete, cycle, grid, path } from '../src/core/families';
import { addEdge, bfs, initialState, isSolved, removeEdge, tick, unreached, wiredGraph, wiringStars, type Edge } from '../src/core/wiring';
import { solveWiring } from '../src/core/wiringSolver';

const empty = (n: number): Graph => ({ nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, x: i / n, y: 0 })), edges: [] });

describe('Wiring rules', () => {
  const g = path(5);
  const p = { seed: 0, ticks: 2, budget: 2 };

  it('adds new edges within budget; rejects duplicates, fixed edges and loops', () => {
    let s = initialState(g, p);
    s = addEdge(g, s, 0, 3, p);
    expect(s.added).toEqual([[0, 3]]);
    expect(addEdge(g, s, 3, 0, p)).toBe(s); // duplicate (either direction)
    expect(addEdge(g, s, 0, 1, p)).toBe(s); // already a fixed edge
    expect(addEdge(g, s, 2, 2, p)).toBe(s);
    s = addEdge(g, s, 1, 4, p);
    expect(addEdge(g, s, 2, 4, p)).toBe(s); // budget spent
  });

  it('removes only added edges', () => {
    let s = addEdge(g, initialState(g, p), 0, 3, p);
    s = removeEdge(g, s, 0, p);
    expect(s.added).toEqual([]);
    expect(removeEdge(g, s, 0, p)).toBe(s);
  });

  it('the test run ticks over the wired network and stops at T', () => {
    let s = addEdge(g, initialState(g, p), 0, 3, p);
    s = tick(g, s, p).state; // 0 → 1, 3
    expect(s.orange).toEqual([true, true, false, true, false]);
    s = tick(g, s, p).state; // → 2, 4
    expect(isSolved(s)).toBe(true);
  });

  it('a run that runs out of ticks stops, and editing resets the run', () => {
    let s = initialState(g, p);
    s = tick(g, s, p).state;
    s = tick(g, s, p).state;
    expect(isSolved(s)).toBe(false);
    expect(tick(g, s, p).state).toBe(s); // T reached
    s = addEdge(g, s, 0, 4, p);
    expect(s.ticks).toBe(0);
    expect(s.orange).toEqual([true, false, false, false, false]);
  });

  it('reports unreached nodes', () => {
    expect(unreached(g, [], p)).toEqual([3, 4]);
    expect(unreached(g, [[0, 3]], p)).toEqual([]);
  });

  it('stars', () => {
    expect(wiringStars(2, 2)).toBe(3);
    expect(wiringStars(3, 2)).toBe(2);
    expect(wiringStars(5, 2)).toBe(1);
  });
});

describe('solveWiring: hand-verified', () => {
  it('a path needs one shortcut', () => {
    expect(solveWiring(path(5), { seed: 0, ticks: 2 }).optimum).toBe(1); // 0–3
  });
  it('no edges at all: a star from the seed for T = 1, any spanning tree otherwise', () => {
    expect(solveWiring(empty(5), { seed: 0, ticks: 1 }).optimum).toBe(4);
    expect(solveWiring(empty(6), { seed: 2, ticks: 3 }).optimum).toBe(5); // connectivity needs n − 1
  });
  it('two separate clusters: one bridge from the seed', () => {
    const k4 = complete(4);
    const g: Graph = {
      nodes: [...k4.nodes, ...k4.nodes.map((v, i) => ({ ...v, id: `m${i}` }))],
      edges: [...k4.edges, ...k4.edges.map(([a, b]) => [a + 4, b + 4] as Edge)],
    };
    expect(solveWiring(g, { seed: 0, ticks: 2 }).optimum).toBe(1);
  });
  it('cycles', () => {
    expect(solveWiring(cycle(8), { seed: 0, ticks: 2 }).optimum).toBe(1); // 0–4
    // C12, T = 2: nodes 3..9 are too far; a new edge can bring at most 3 of them in.
    expect(solveWiring(cycle(12), { seed: 0, ticks: 2 }).optimum).toBe(3);
  });
  it('already fine: zero edges', () => {
    expect(solveWiring(grid(3, 3), { seed: 4, ticks: 2 }).optimum).toBe(0);
  });
});

// Brute force: try every set of k non-edges, for k = 0, 1, 2, ...
function bruteForce(g: Graph, seed: number, ticks: number): number {
  const n = g.nodes.length;
  const base = adjacency(g);
  const pairs: Edge[] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (!base[a].includes(b)) pairs.push([a, b]);
  const ok = (extra: Edge[]) => bfs(adjacency(wiredGraph(g, extra)), seed).every((d) => d <= ticks);
  for (let k = 0; k <= n; k++) {
    const pick = (from: number, chosen: Edge[]): boolean => {
      if (chosen.length === k) return ok(chosen);
      for (let i = from; i < pairs.length; i++) {
        chosen.push(pairs[i]);
        if (pick(i + 1, chosen)) return true;
        chosen.pop();
      }
      return false;
    };
    if (pick(0, [])) return k;
  }
  throw new Error('unreachable');
}

function randomGraph(n: number, p: number, seed: number): Graph {
  let x = seed;
  const rand = () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const edges: Edge[] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (rand() < p) edges.push([a, b]);
  return { nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, x: 0, y: 0 })), edges };
}

describe('solveWiring agrees with brute force', () => {
  it('on 60 random small graphs with T = 1..3', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const n = 4 + (seed % 4);
      const g = randomGraph(n, 0.1 + (seed % 4) * 0.12, seed);
      const ticks = 1 + (seed % 3);
      const s = seed % n;
      expect(solveWiring(g, { seed: s, ticks }).optimum, `seed ${seed}`).toBe(bruteForce(g, s, ticks));
    }
  });

  it('the returned edges really work', () => {
    for (const [g, seed, ticks] of [
      [cycle(12), 0, 2],
      [grid(4, 4), 0, 3],
      [path(9), 4, 2],
    ] as [Graph, number, number][]) {
      const { edges } = solveWiring(g, { seed, ticks });
      expect(unreached(g, edges, { seed, ticks, budget: 99 })).toEqual([]);
    }
  });
});

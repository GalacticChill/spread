import { describe, expect, it } from 'vitest';
import { adjacency, type Graph } from '../src/core/graph';
import { barbell, binaryTree, complete, cycle, grid, hypercubeQ3, path, petersen, spider, star } from '../src/core/families';
import { distanceDominatingSet, solveSpread } from '../src/core/solver';
import { initialState, isComplete, tap, tick } from '../src/core/spread';

// Hand-verified answers. For paths and cycles the distance-t domination number is
// ceil(n / (2t+1)), so par = min over t of t + ceil(n / (2t+1)) (with t=0 meaning tap all).
describe('solveSpread: hand-verified pars', () => {
  it.each([
    [1, 1], // a single node: tap it
    [2, 2], // tap both, or tap one + tick
    [3, 2], // tap middle, tick
    [5, 3], // t=1: 1+2, t=2: 2+1
    [7, 4], // t=1: 1+3, t=2: 2+2, t=3: 3+1
    [9, 4], // t=1: 1+3, t=2: 2+2
  ])('path P%i has par %i', (n, par) => {
    expect(solveSpread(path(n)).par).toBe(par);
  });

  it.each([
    [1, 2],
    [5, 2], // tap the center, tick
    [12, 2],
  ])('star with %i leaves has par %i', (leaves, par) => {
    expect(solveSpread(star(leaves)).par).toBe(par);
  });

  it.each([
    [3, 2], // C3 = K3
    [6, 3], // t=1: 1+2
    [10, 4], // t=1: 1+4, t=2: 2+2, t=3: 3+2
    [12, 5], // t=1: 1+4, t=2: 2+3, t=3: 3+2
  ])('cycle C%i has par %i', (n, par) => {
    expect(solveSpread(cycle(n)).par).toBe(par);
  });

  it.each([
    [1, 1],
    [2, 2],
    [5, 2], // tap any node, tick
    [8, 2],
  ])('complete graph K%i has par %i', (n, par) => {
    expect(solveSpread(complete(n)).par).toBe(par);
  });

  it('famous graphs', () => {
    expect(solveSpread(petersen()).par).toBe(3); // diameter 2: one seed + 2 ticks; domination number 3 → 1+3 = 4
    expect(solveSpread(hypercubeQ3()).par).toBe(3); // domination number of Q3 is 2 → 1+2
    expect(solveSpread(grid(3, 3)).par).toBe(3); // center + 2 ticks
  });

  it('disconnected graphs need a seed per component', () => {
    const g: Graph = { nodes: [0, 1, 2].map((i) => ({ id: `n${i}`, x: 0, y: 0 })), edges: [[0, 1]] };
    expect(solveSpread(g).par).toBe(3); // tap all 3, or tap 0 and 2 then tick: both cost 3
  });
});

describe('distanceDominatingSet', () => {
  it('matches ceil(n / (2t+1)) on paths and cycles', () => {
    for (const n of [4, 7, 9, 11]) {
      for (const t of [1, 2, 3]) {
        expect(distanceDominatingSet(path(n), t)!.length).toBe(Math.ceil(n / (2 * t + 1)));
        expect(distanceDominatingSet(cycle(n), t)!.length).toBe(Math.ceil(n / (2 * t + 1)));
      }
    }
  });

  it('known domination numbers', () => {
    expect(distanceDominatingSet(petersen(), 1)!.length).toBe(3);
    expect(distanceDominatingSet(hypercubeQ3(), 1)!.length).toBe(2);
    expect(distanceDominatingSet(grid(3, 3), 1)!.length).toBe(3);
    expect(distanceDominatingSet(grid(4, 4), 1)!.length).toBe(4);
  });
});

describe('solver plans actually work', () => {
  const graphs: [string, Graph][] = [
    ['path 9', path(9)],
    ['cycle 10', cycle(10)],
    ['binary tree', binaryTree(4)],
    ['spider', spider(4, 3)],
    ['grid 5x5', grid(5, 5)],
    ['barbell', barbell(6, 3)],
    ['petersen', petersen()],
  ];
  it.each(graphs)('%s: tapping the seeds then ticking finishes in exactly par moves', (_, g) => {
    const { par, seeds, ticks } = solveSpread(g);
    let s = initialState(g);
    for (const v of seeds) s = tap(s, v);
    for (let i = 0; i < ticks; i++) s = tick(g, s).state;
    expect(isComplete(s)).toBe(true);
    expect(s.moves).toBe(par);
  });
});

// Independent check of the "tap early is never worse" argument: search the full game
// (any interleaving of taps and ticks) by BFS over orange-sets and compare.
function bruteForcePar(g: Graph): number {
  const n = g.nodes.length;
  const adj = adjacency(g);
  const full = 2 ** n - 1;
  const seen = new Map<number, number>([[0, 0]]);
  const queue = [0];
  for (let head = 0; head < queue.length; head++) {
    const s = queue[head];
    if (s === full) return seen.get(s)!;
    const next: number[] = [];
    for (let v = 0; v < n; v++) if (!(s & (1 << v))) next.push(s | (1 << v));
    let t = s;
    for (let u = 0; u < n; u++) if (s & (1 << u)) for (const v of adj[u]) t |= 1 << v;
    next.push(t);
    for (const s2 of next) {
      if (!seen.has(s2)) {
        seen.set(s2, seen.get(s)! + 1);
        queue.push(s2);
      }
    }
  }
  throw new Error('unreachable');
}

function randomGraph(n: number, p: number, seed: number): Graph {
  let x = seed;
  const rand = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const edges: [number, number][] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (rand() < p) edges.push([a, b]);
  return { nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, x: 0, y: 0 })), edges };
}

describe('solver agrees with brute-force game search', () => {
  it('on 60 random small graphs', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const g = randomGraph(4 + (seed % 7), 0.15 + (seed % 5) * 0.1, seed);
      expect(solveSpread(g).par, `seed ${seed}`).toBe(bruteForcePar(g));
    }
  });
});

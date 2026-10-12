import { describe, expect, it } from 'vitest';
import { adjacency, type Graph } from '../src/core/graph';
import { binaryTree, complete, cycle, grid, hypercubeQ3, path, petersen, star } from '../src/core/families';
import { solveSpread } from '../src/core/solver';
import { initialState, isComplete, tap } from '../src/core/spread';
import { litNeighbors, thresholdTick } from '../src/core/threshold';
import { solveThreshold } from '../src/core/thresholdSolver';

/** Copy of a graph with thresholds set by a function of node index. */
function withThresholds(g: Graph, r: (v: number) => number): Graph {
  return { nodes: g.nodes.map((node, v) => ({ ...node, threshold: r(v) })), edges: g.edges };
}

describe('Threshold rules', () => {
  // Path 0-1-2-3-4: ends r=1, middle r=2.
  const g = withThresholds(path(5), (v) => (v === 0 || v === 4 ? 1 : 2));

  it('a node with r = 2 needs two orange neighbors', () => {
    const s = tap(initialState(g), 1);
    const r = thresholdTick(g, s);
    expect(r.state.orange).toEqual([true, true, false, false, false]); // node 2 has only one
    expect(r.newlyOrange).toEqual([0]);
    expect(r.state.moves).toBe(2);
  });

  it('two orange neighbors are enough, and the ripple shows both', () => {
    const s = tap(tap(initialState(g), 1), 3);
    const r = thresholdTick(g, s);
    expect(isComplete(r.state)).toBe(true);
    expect(r.paths.filter(([, to]) => to === 2).sort()).toEqual([
      [1, 2],
      [3, 2],
    ]);
  });

  it('a stuck tick still costs a move', () => {
    const s = tap(initialState(g), 2);
    const r = thresholdTick(g, s);
    expect(r.newlyOrange).toEqual([]);
    expect(r.state.moves).toBe(2);
  });

  it('counts orange neighbors', () => {
    expect(litNeighbors(g, tap(tap(initialState(g), 1), 3))).toEqual([1, 0, 2, 0, 1]);
  });

  it('missing thresholds default to 1 (plain Spread)', () => {
    const p = path(3);
    expect(thresholdTick(p, tap(initialState(p), 1)).state.orange).toEqual([true, true, true]);
  });
});

describe('solveThreshold: hand-verified pars', () => {
  it('with every r = 1 it agrees with the Spread solver', () => {
    for (const g of [path(9), cycle(10), star(5), petersen(), grid(4, 4), binaryTree(4)]) {
      expect(solveThreshold(g).par).toBe(solveSpread(g).par);
    }
  });

  it('path with r = 2 inside: seed nodes 1 and 3, tick once', () => {
    expect(solveThreshold(withThresholds(path(5), (v) => (v === 0 || v === 4 ? 1 : 2))).par).toBe(3);
  });

  it('cycle C6 with r = 2: every other node, then one tick', () => {
    // 2 seeds + 1 tick fails (4 nodes each need 2 of only 4 seed-incidences); 3 + 1 works.
    expect(solveThreshold(withThresholds(cycle(6), () => 2)).par).toBe(4);
  });

  it('complete graphs: r seeds and one tick', () => {
    expect(solveThreshold(withThresholds(complete(5), () => 2)).par).toBe(3);
    expect(solveThreshold(withThresholds(complete(6), () => 3)).par).toBe(4);
  });

  it('a node with r above its degree must be a seed', () => {
    // Star whose leaves need 2 orange neighbors but only have 1: every leaf is a seed.
    const g = withThresholds(star(4), (v) => (v === 0 ? 1 : 2));
    expect(solveThreshold(g).par).toBe(5); // tap all 5 (or 4 leaves + 1 tick)
  });

  it('wheel W8, rim r = 2: the hub alone does nothing', () => {
    // Hub 0 + rim 1..8. Rim nodes have 3 neighbors (2 rim + hub).
    const rim = cycle(8);
    const g: Graph = withThresholds(
      {
        nodes: [{ id: 'hub', x: 0.5, y: 0.5 }, ...rim.nodes.map((v, i) => ({ ...v, id: `r${i}` }))],
        edges: [...rim.edges.map(([a, b]) => [a + 1, b + 1] as [number, number]), ...rim.nodes.map((_, i) => [0, i + 1] as [number, number])],
      },
      (v) => (v === 0 ? 3 : 2),
    );
    // 4 alternating rim seeds + 1 tick (rim fills, hub sees 4 ≥ 3). 4 moves is impossible.
    expect(solveThreshold(g).par).toBe(5);
  });
});

// Brute force over the actual game rules: BFS over orange sets, where each move is a tap
// on any uncolored node or a tick. Independently checks the "seed first" argument.
function bruteForcePar(g: Graph): number {
  const n = g.nodes.length;
  const adj = adjacency(g);
  const full = 2 ** n - 1;
  const toState = (mask: number) => ({ orange: g.nodes.map((_, v) => !!(mask & (1 << v))), moves: 0 });
  const toMask = (orange: readonly boolean[]) => orange.reduce((m, o, v) => (o ? m | (1 << v) : m), 0);
  const dist = new Map<number, number>([[0, 0]]);
  const queue = [0];
  for (let head = 0; head < queue.length; head++) {
    const s = queue[head];
    if (s === full) return dist.get(s)!;
    const next = [toMask(thresholdTick(g, toState(s), adj).state.orange)];
    for (let v = 0; v < n; v++) if (!(s & (1 << v))) next.push(s | (1 << v));
    for (const s2 of next) {
      if (!dist.has(s2)) {
        dist.set(s2, dist.get(s)! + 1);
        queue.push(s2);
      }
    }
  }
  throw new Error('unreachable');
}

function randomGraph(n: number, p: number, seed: number): Graph {
  let x = seed;
  const rand = () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const edges: [number, number][] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (rand() < p) edges.push([a, b]);
  return { nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, x: 0, y: 0, threshold: 1 + Math.floor(rand() * 3) })), edges };
}

describe('solveThreshold agrees with brute force over the game rules', () => {
  it('on 80 random small graphs with thresholds 1–3', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const g = randomGraph(4 + (seed % 6), 0.3 + (seed % 4) * 0.12, seed);
      expect(solveThreshold(g).par, `seed ${seed}`).toBe(bruteForcePar(g));
    }
  });

  it('on small classic graphs with r = 2', () => {
    for (const g of [grid(3, 3), hypercubeQ3(), cycle(7)]) {
      const g2 = withThresholds(g, () => 2);
      expect(solveThreshold(g2).par).toBe(bruteForcePar(g2));
    }
  });
});

describe('solver plans actually work', () => {
  it.each([
    ['grid 5x5, r = 2', withThresholds(grid(5, 5), () => 2)],
    ['petersen, r = 2', withThresholds(petersen(), () => 2)],
    ['binary tree, inner r = 2', withThresholds(binaryTree(4), (v) => (v < 7 ? 2 : 1))],
  ])('%s: tapping the seeds then ticking finishes in exactly par moves', (_, g) => {
    const { par, seeds, ticks } = solveThreshold(g);
    let s = initialState(g);
    for (const v of seeds) s = tap(s, v);
    for (let i = 0; i < ticks; i++) s = thresholdTick(g, s).state;
    expect(isComplete(s)).toBe(true);
    expect(s.moves).toBe(par);
  });
});

describe('levels that teach "the hub is a poor seed"', () => {
  it.each(['Wheel W6', 'Hub and ring'])('%s: every plan that seeds the hub is worse than par', async (name) => {
    const { default: levels } = await import('../src/levels/threshold.json');
    const level = levels.find((l) => l.name === name)!;
    const g = level.graph as Graph;
    // Force the hub (node 0) to be a seed by making it impossible to activate otherwise.
    const forced = { ...g, nodes: g.nodes.map((v, i) => (i === 0 ? { ...v, threshold: 99 } : v)) };
    expect(solveThreshold(g).par).toBe(level.par);
    expect(solveThreshold(forced).par).toBeGreaterThan(level.par);
    // In plain Spread the hub is the obvious seed.
    expect(solveSpread(withThresholds(g, () => 1)).par).toBeLessThan(level.par);
  });
});

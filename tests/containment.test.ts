import { describe, expect, it } from 'vitest';
import { adjacency, type Graph } from '../src/core/graph';
import { binaryTree, grid, layeredTree, path, star } from '../src/core/families';
import {
  FREE,
  ORANGE,
  PROTECTED,
  containmentStars,
  initialState,
  isOver,
  savedCount,
  shieldsLeft,
  tick,
  toggleProtect,
  type ContainmentState,
} from '../src/core/containment';
import { solveContainment } from '../src/core/containmentSolver';

describe('Containment rules', () => {
  const g = path(5);

  it('starts with orange on the sources', () => {
    const s = initialState(g, [2], 1);
    expect(s.status).toEqual([FREE, FREE, ORANGE, FREE, FREE]);
    expect(shieldsLeft(s)).toBe(1);
  });

  it('protects up to k nodes per turn, and protections can be taken back before the tick', () => {
    let s = initialState(g, [2], 1);
    s = toggleProtect(g, s, 1);
    expect(s.status[1]).toBe(PROTECTED);
    expect(shieldsLeft(s)).toBe(0);
    expect(toggleProtect(g, s, 3)).toBe(s); // no shields left
    s = toggleProtect(g, s, 1); // take it back
    expect(s.status[1]).toBe(FREE);
    expect(shieldsLeft(s)).toBe(1);
  });

  it('cannot protect orange nodes', () => {
    const s = initialState(g, [2], 1);
    expect(toggleProtect(g, s, 2)).toBe(s);
  });

  it('tick spreads to unprotected neighbors only, and makes protections permanent', () => {
    let s = toggleProtect(g, initialState(g, [2], 1), 1);
    const r = tick(g, s);
    s = r.state;
    expect(s.status).toEqual([FREE, PROTECTED, ORANGE, ORANGE, FREE]);
    expect(r.paths).toEqual([[2, 3]]);
    expect(s.placed).toEqual([]);
    expect(shieldsLeft(s)).toBe(1);
    expect(toggleProtect(g, s, 1)).toBe(s); // last turn's protection is permanent
  });

  it('ends when orange can no longer spread', () => {
    let s = toggleProtect(g, initialState(g, [2], 1), 1);
    s = tick(g, s).state;
    expect(isOver(g, s)).toBe(false);
    s = toggleProtect(g, s, 4);
    expect(isOver(g, s)).toBe(true);
    expect(savedCount(s)).toBe(3);
    expect(tick(g, s).state).toBe(s);
  });

  it('a tick with no protections is allowed', () => {
    const s = tick(g, initialState(g, [0], 1)).state;
    expect(s.status.slice(0, 2)).toEqual([ORANGE, ORANGE]);
  });

  it('stars compare saved nodes with the optimum', () => {
    expect(containmentStars(11, 11)).toBe(3);
    expect(containmentStars(10, 11)).toBe(2);
    expect(containmentStars(9, 11)).toBe(1);
  });
});

// Hand-verified optimal values.
describe('solveContainment: hand-verified', () => {
  it('path, fire at one end: protect its neighbor, save the rest', () => {
    expect(solveContainment(path(7), [0], 1).optimum).toBe(6);
  });

  it('path, fire in the middle: block one side, then the other', () => {
    // P5 from node 2: protect 1, tick (3 burns), protect 4 → saved 0,1,4.
    expect(solveContainment(path(5), [2], 1).optimum).toBe(3);
    // P7 from node 3: protect 2, tick (4 burns), protect 5 → saved 0,1,2,5,6.
    expect(solveContainment(path(7), [3], 1).optimum).toBe(5);
    // With two shields per turn both sides are blocked at once.
    expect(solveContainment(path(7), [3], 2).optimum).toBe(6);
  });

  it('star: fire at the center saves one leaf; fire on a leaf saves everything else', () => {
    expect(solveContainment(star(5), [0], 1).optimum).toBe(1);
    expect(solveContainment(star(5), [1], 1).optimum).toBe(5);
  });

  it('complete binary trees with fire at the root', () => {
    // 7 nodes: save a child's subtree (3), then one grandchild (1).
    expect(solveContainment(binaryTree(3), [0], 1).optimum).toBe(4);
    // 15 nodes: 7 + 3 + 1.
    expect(solveContainment(binaryTree(4), [0], 1).optimum).toBe(11);
  });

  it('the greedy "protect the biggest subtree" choice can be wrong', () => {
    // Root 0 burns. Child 1 has two leaves (subtree 3); child 2 leads to node 5 with three
    // leaves (subtree 5). Greedy protects 2 (saves 5) then one leaf of 1: 6 saved.
    // Better: protect 1 (saves 3), let 2 burn, then protect 5 (saves 4): 7 saved.
    const g = layeredTree([-1, 0, 0, 1, 1, 2, 5, 5, 5]);
    const sol = solveContainment(g, [0], 1);
    expect(sol.optimum).toBe(7);
    expect(sol.plan[0]).toEqual([1]);
  });

  it('multiple sources and nothing to save', () => {
    expect(solveContainment(path(3), [0, 2], 1).optimum).toBe(1);
    expect(solveContainment(path(2), [0, 1], 1).optimum).toBe(0);
  });
});

// Independent check: brute force over the real game rules, trying every set of 0..k
// protections among ALL free nodes each turn (no memo, no shortcuts).
function bruteForce(g: Graph, sources: number[], k: number): number {
  const adj = adjacency(g);
  const go = (s: ContainmentState): number => {
    if (isOver(g, s, adj)) return savedCount(s);
    let best = 0;
    const free = s.status.flatMap((st, v) => (st === FREE ? [v] : []));
    const tryFrom = (state: ContainmentState, start: number) => {
      // Option: stop protecting and tick.
      best = Math.max(best, isOver(g, state, adj) ? savedCount(state) : go(tick(g, state, adj).state));
      if (shieldsLeft(state) === 0) return;
      for (let i = start; i < free.length; i++) tryFrom(toggleProtect(g, state, free[i], adj), i + 1);
    };
    tryFrom(s, 0);
    return best;
  };
  return go(initialState(g, sources, k));
}

function randomGraph(n: number, p: number, seed: number): Graph {
  let x = seed;
  const rand = () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const edges: [number, number][] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (rand() < p) edges.push([a, b]);
  return { nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, x: 0, y: 0 })), edges };
}

describe('solveContainment agrees with brute force over the game rules', () => {
  it('on 80 random small graphs with 1–2 sources and k = 1–2', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const n = 4 + (seed % 5);
      const g = randomGraph(n, 0.2 + (seed % 4) * 0.12, seed);
      const sources = seed % 3 === 0 ? [0, n - 1] : [seed % n];
      const k = 1 + (seed % 2);
      expect(solveContainment(g, sources, k).optimum, `seed ${seed}`).toBe(bruteForce(g, sources, k));
    }
  });

  it('on small grids and trees', () => {
    expect(solveContainment(grid(3, 3), [0], 1).optimum).toBe(bruteForce(grid(3, 3), [0], 1));
    expect(solveContainment(grid(2, 4), [1], 1).optimum).toBe(bruteForce(grid(2, 4), [1], 1));
    expect(solveContainment(binaryTree(3), [3], 1).optimum).toBe(bruteForce(binaryTree(3), [3], 1));
  });
});

describe('solver plans actually work', () => {
  const cases: [string, Graph, number[], number][] = [
    ['binary tree', binaryTree(4), [0], 1],
    ['grid 4x4 corner', grid(4, 4), [0], 1],
    ['grid 5x5 center, k=2', grid(5, 5), [12], 2],
    ['path, two fires', path(9), [2, 6], 1],
  ];
  it.each(cases)('%s: following the plan saves exactly the optimum', (_, g, sources, k) => {
    const { optimum, plan } = solveContainment(g, sources, k);
    let s = initialState(g, sources, k);
    for (const turn of plan) {
      for (const v of turn) s = toggleProtect(g, s, v);
      if (isOver(g, s)) break;
      s = tick(g, s).state;
    }
    while (!isOver(g, s)) s = tick(g, s).state;
    expect(savedCount(s)).toBe(optimum);
  });
});

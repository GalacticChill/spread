import { describe, expect, it } from 'vitest';
import { adjacency, type Graph } from '../src/core/graph';
import { binaryTree, cycle, grid, path, star } from '../src/core/families';
import { BLUE, FREE, GRAY, ORANGE, canSpread, initialState, isOver, orangeCount, rivalStars, tap, tick, type RivalState } from '../src/core/rival';
import { solveRival } from '../src/core/rivalSolver';

describe('Rival rules', () => {
  const g = path(5);

  it('blue starts on its nodes; taps use the budget', () => {
    let s = initialState(g, [0], 2);
    expect(s.status).toEqual([BLUE, FREE, FREE, FREE, FREE]);
    s = tap(s, 3);
    expect(s.status[3]).toBe(ORANGE);
    expect(s.tapsLeft).toBe(1);
    expect(tap(s, 0)).toBe(s); // can't tap a colored node
    s = tap(s, 4);
    expect(tap(s, 2)).toBe(s); // budget spent
  });

  it('both colors spread at once; reaching a node together makes it gray', () => {
    // Blue at 0, orange at 2: node 1 is reached by both → gray. Node 3 goes orange.
    const r = tick(g, tap(initialState(g, [0], 1), 2));
    expect(r.state.status).toEqual([BLUE, GRAY, ORANGE, ORANGE, FREE]);
    expect(r.paths).toEqual(
      expect.arrayContaining([
        [2, 1],
        [0, 1],
        [2, 3],
      ]),
    );
  });

  it('colored nodes never change, and gray blocks both colors', () => {
    let s = tap(initialState(g, [0], 1), 2);
    s = tick(g, s).state; // 1 gray
    s = tick(g, s).state; // 4 orange
    expect(s.status).toEqual([BLUE, GRAY, ORANGE, ORANGE, ORANGE]);
    expect(canSpread(g, s)).toBe(false);
    expect(isOver(g, s)).toBe(true);
    expect(orangeCount(s)).toBe(3);
  });

  it('is not over while taps remain and uncolored nodes exist', () => {
    const iso: Graph = { nodes: [0, 1, 2].map((i) => ({ id: `n${i}`, x: 0, y: 0 })), edges: [[0, 1]] };
    let s = tick(iso, initialState(iso, [0], 1)).state; // blue takes 1; node 2 isolated
    expect(isOver(iso, s)).toBe(false);
    s = tap(s, 2);
    expect(isOver(iso, s)).toBe(true);
  });

  it('stars', () => {
    expect(rivalStars(6, 6)).toBe(3);
    expect(rivalStars(5, 6)).toBe(2);
    expect(rivalStars(3, 6)).toBe(1);
  });
});

describe('solveRival: hand-verified', () => {
  it('block blue right at the source', () => {
    expect(solveRival(path(7), [0], 1).optimum).toBe(6); // tap node 1
  });
  it('blue in the middle of a path: take one whole side', () => {
    // P9, blue at 4: tap 3 → orange gets 0..3. Tapping 2 instead makes 3 gray (3 orange).
    expect(solveRival(path(9), [4], 1).optimum).toBe(4);
  });
  it('star: grab the hub', () => {
    expect(solveRival(star(6), [1], 1).optimum).toBe(6);
  });
  it('no taps, no orange', () => {
    expect(solveRival(path(5), [0], 0).optimum).toBe(0);
  });
  it('cycle with blue at 0 and two taps: wall it in', () => {
    // C8: tap 1 and 7 → blue is stuck at 0; orange takes all 7 other nodes.
    expect(solveRival(cycle(8), [0], 2).optimum).toBe(7);
  });
});

// Brute force over EVERY interleaving of taps and ticks, with memoization on the state.
function bruteForce(g: Graph, blue: number[], budget: number): number {
  const adj = adjacency(g);
  const memo = new Map<string, number>();
  const go = (s: RivalState): number => {
    if (isOver(g, s, adj)) return orangeCount(s);
    const key = `${s.status.join('')}:${s.tapsLeft}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let best = -1;
    if (canSpread(g, s, adj)) best = go(tick(g, s, adj).state);
    s.status.forEach((st, v) => {
      if (st === FREE && s.tapsLeft > 0) best = Math.max(best, go(tap(s, v)));
    });
    memo.set(key, best);
    return best;
  };
  return go(initialState(g, blue, budget));
}

function randomGraph(n: number, p: number, seed: number): Graph {
  let x = seed;
  const rand = () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const edges: [number, number][] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (rand() < p) edges.push([a, b]);
  return { nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, x: 0, y: 0 })), edges };
}

describe('solveRival agrees with brute force over all interleavings', () => {
  it('on 80 random small graphs (supports "tap everything first")', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const n = 4 + (seed % 5);
      const g = randomGraph(n, 0.25 + (seed % 4) * 0.12, seed);
      const blue = seed % 3 === 0 ? [0, n - 1] : [seed % n];
      const budget = 1 + (seed % 3);
      expect(solveRival(g, blue, budget).optimum, `seed ${seed}`).toBe(bruteForce(g, blue, budget));
    }
  });

  it('on small classic graphs', () => {
    for (const [g, blue, k] of [
      [grid(3, 3), [4], 2],
      [binaryTree(3), [3], 1],
      [cycle(7), [0, 3], 2],
    ] as [Graph, number[], number][]) {
      expect(solveRival(g, blue, k).optimum).toBe(bruteForce(g, blue, k));
    }
  });
});

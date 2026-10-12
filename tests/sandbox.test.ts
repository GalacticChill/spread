import { describe, expect, it } from 'vitest';
import { completeBipartite, cycle, hypercube, path, petersen, randomGraph } from '../src/core/families';
import type { Graph } from '../src/core/graph';
import {
  GENERATORS,
  addEdge,
  addNode,
  deleteEdge,
  deleteNode,
  docToLevel,
  emptyDoc,
  generate,
  markNode,
  moveNode,
  parseImport,
  playProblem,
  replaceGraph,
  serialize,
  solveDoc,
  type SandboxDoc,
} from '../src/core/sandbox';
import { graphStats } from '../src/core/stats';
import rivalLevels from '../src/levels/rival.json';

const docWith = (graph: Graph, extra: Partial<SandboxDoc> = {}): SandboxDoc => ({ ...replaceGraph(emptyDoc(), graph), ...extra });

describe('new generators', () => {
  it('complete bipartite K(m,n) has m·n edges', () => {
    const g = completeBipartite(3, 4);
    expect(g.nodes).toHaveLength(7);
    expect(g.edges).toHaveLength(12);
  });

  it('hypercube Q_d has 2^d nodes, d·2^(d−1) edges, and every degree d', () => {
    for (const d of [1, 2, 3, 4, 5]) {
      const g = hypercube(d);
      expect(g.nodes).toHaveLength(2 ** d);
      expect(g.edges).toHaveLength(d * 2 ** (d - 1));
      expect(new Set(graphStats(g).degrees)).toEqual(new Set([d]));
      expect(graphStats(g).diameter).toBe(d);
    }
  });

  it('random graph: p = 0 is empty, p = 1 is complete', () => {
    expect(randomGraph(8, 0).edges).toHaveLength(0);
    expect(randomGraph(8, 1).edges).toHaveLength(28);
  });

  it('every sandbox generator builds a valid graph inside 0–1 with its default sizes', () => {
    for (const spec of GENERATORS) {
      const values = Object.fromEntries(spec.params.map((q) => [q.key, q.value]));
      const g = generate(spec, values, () => 0.1);
      expect(g.nodes.length, spec.id).toBeGreaterThan(0);
      for (const v of g.nodes) {
        expect(v.x).toBeGreaterThanOrEqual(0);
        expect(v.x).toBeLessThanOrEqual(1);
        expect(v.y).toBeGreaterThanOrEqual(0);
        expect(v.y).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('graph stats', () => {
  it('path, cycle, Petersen', () => {
    expect(graphStats(path(5))).toEqual({ nodes: 5, edges: 4, degrees: [2, 2, 2, 1, 1], components: 1, connected: true, diameter: 4 });
    expect(graphStats(cycle(6)).diameter).toBe(3);
    expect(graphStats(petersen())).toMatchObject({ edges: 15, diameter: 2, connected: true });
  });

  it('disconnected graphs have infinite diameter', () => {
    const g: Graph = { nodes: [0, 1, 2].map((i) => ({ id: `n${i}`, x: 0, y: 0 })), edges: [[0, 1]] };
    expect(graphStats(g)).toMatchObject({ connected: false, components: 2, diameter: Infinity });
  });

  it('empty and single-node graphs', () => {
    expect(graphStats({ nodes: [], edges: [] })).toMatchObject({ nodes: 0, diameter: 0 });
    expect(graphStats({ nodes: [{ id: 'a', x: 0, y: 0 }], edges: [] })).toMatchObject({ connected: true, diameter: 0 });
  });
});

describe('editing', () => {
  it('adds nodes (clamped to 0–1, unique ids) and edges (no loops or duplicates)', () => {
    let d = addNode(addNode(emptyDoc(), 0.2, 0.3), 1.4, -1);
    expect(d.graph.nodes.map((v) => [v.id, v.x, v.y])).toEqual([
      ['n0', 0.2, 0.3],
      ['n1', 1, 0],
    ]);
    d = addEdge(d, 0, 1);
    expect(addEdge(d, 1, 0)).toBe(d);
    expect(addEdge(d, 1, 1)).toBe(d);
    expect(d.graph.edges).toEqual([[0, 1]]);
  });

  it('deleting a node removes its edges and shifts later indices (edges and marks)', () => {
    let d = docWith(path(4), { mode: 'containment' }); // 0-1-2-3
    d = markNode(markNode(d, 3), 1);
    d = deleteNode(d, 1);
    expect(d.graph.nodes).toHaveLength(3);
    expect(d.graph.edges).toEqual([[1, 2]]); // old 2-3
    expect(d.marks).toEqual([2]); // old 3
  });

  it('deletes edges and moves nodes', () => {
    let d = docWith(path(3));
    d = deleteEdge(d, 0);
    expect(d.graph.edges).toEqual([[1, 2]]);
    d = moveNode(d, 0, 0.25, 0.75);
    expect(d.graph.nodes[0]).toMatchObject({ x: 0.25, y: 0.75 });
  });

  it('the mark tool depends on the mode', () => {
    const g = path(3);
    // Threshold: cycles r 1 → 2 → 3 → 4 → 1.
    let d = docWith(g, { mode: 'threshold' });
    for (const r of [2, 3, 4, 1]) {
      d = markNode(d, 1);
      expect(d.graph.nodes[1].threshold).toBe(r);
    }
    // Wiring: a single seed.
    d = markNode(markNode(docWith(g, { mode: 'wiring' }), 0), 2);
    expect(d.marks).toEqual([2]);
    // Rival: toggles.
    d = markNode(markNode(markNode(docWith(g, { mode: 'rival' }), 0), 2), 0);
    expect(d.marks).toEqual([2]);
    // Spread: no marks.
    const sd = docWith(g);
    expect(markNode(sd, 0)).toBe(sd);
  });
});

describe('import / export', () => {
  it('round-trips a sandbox document', () => {
    const d = markNode(docWith(cycle(5), { mode: 'rival', settings: { k: 2, budget: 3, ticks: 4, timed: true } }), 2);
    expect(parseImport(serialize(d))).toEqual(d);
  });

  it('imports a bare graph and rescales positions outside 0–1', () => {
    const d = parseImport('{"nodes":[{"x":0,"y":0},{"x":10,"y":5}],"edges":[[0,1],[1,0],[1,1]]}');
    expect(d.mode).toBe('spread');
    expect(d.graph.edges).toEqual([[0, 1]]); // duplicate and loop dropped
    expect(d.graph.nodes[1].x).toBe(1);
  });

  it('imports a level from the game, mapping its params', () => {
    const level = rivalLevels[0];
    const d = parseImport(JSON.stringify(level));
    expect(d.mode).toBe('rival');
    expect(d.marks).toEqual(level.params.blue);
    expect(d.settings.budget).toBe(level.params.budget);
  });

  it('gives readable errors', () => {
    expect(() => parseImport('not json')).toThrow(/valid JSON/);
    expect(() => parseImport('{"edges":[]}')).toThrow(/nodes/);
    expect(() => parseImport('{"nodes":[{"x":0}]}')).toThrow(/numeric x and y/);
    expect(() => parseImport('{"nodes":[{"x":0,"y":0}],"edges":[[0,4]]}')).toThrow(/missing node/);
  });
});

describe('playing and solving', () => {
  it('reports what is missing before a mode can be played', () => {
    expect(playProblem(emptyDoc())).toMatch(/Add some nodes/);
    expect(playProblem(docWith(path(3), { mode: 'containment' }))).toMatch(/fire/);
    expect(playProblem(docWith(path(3), { mode: 'wiring' }))).toMatch(/seed/);
    expect(playProblem(docWith(path(3)))).toBeNull();
  });

  it('builds levels for every mode', () => {
    const g = path(5);
    for (const mode of ['spread', 'threshold', 'containment', 'rival', 'origin', 'wiring'] as const) {
      const level = docToLevel(markNode(docWith(g, { mode }), 2), 3);
      expect(level.mode).toBe(mode);
      expect(level.graph.nodes).toHaveLength(5);
    }
  });

  it('solves each mode with the same answers as the mode solvers', () => {
    const g = path(7);
    expect(solveDoc(docWith(g)).target).toBe(4); // P7 par
    expect(solveDoc(markNode(docWith(g, { mode: 'containment' }), 3)).target).toBe(5);
    expect(solveDoc(markNode(docWith(g, { mode: 'rival', settings: { k: 1, budget: 1, ticks: 2, timed: false } }), 0)).target).toBe(6);
    expect(solveDoc(markNode(docWith(path(5), { mode: 'wiring' }), 0)).target).toBe(1); // T = 2 by default
    const origin = solveDoc(markNode(docWith(g, { mode: 'origin', settings: { k: 1, budget: 2, ticks: 1, timed: false } }), 3));
    expect(origin).toMatchObject({ ok: true, target: 1 });
  });

  it('says when a graph is too large to solve exactly', () => {
    const r = solveDoc(docWith(path(35)));
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/Too large/);
  });
});

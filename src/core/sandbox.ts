// Sandbox: a user-built graph plus a chosen mode and its settings. Pure functions for
// editing, import/export, turning the graph into a playable level, and solving it.
// solveDoc runs inside a Web Worker in the app (src/workers/solver.worker.ts).

import { solveContainment, MAX_CONTAINMENT_NODES } from './containmentSolver';
import {
  binaryTree,
  complete,
  completeBipartite,
  cycle,
  grid,
  hypercube,
  normalize,
  path,
  petersen,
  randomGraph,
  star,
} from './families';
import type { Graph, GraphNode } from './graph';
import type { Level, ModeId } from './level';
import { allExplanations, observe } from './origin';
import { solveRival } from './rivalSolver';
import { MAX_SOLVER_NODES, solveSpread } from './solver';
import { MAX_THRESHOLD_NODES, solveThreshold } from './thresholdSolver';
import { solveWiring } from './wiringSolver';

export const MODE_IDS: ModeId[] = ['spread', 'containment', 'threshold', 'rival', 'origin', 'wiring'];
export const MAX_SANDBOX_NODES = 60;
export const MAX_THRESHOLD = 4;

export interface SandboxSettings {
  /** Containment: protections per turn. */
  k: number;
  /** Rival: orange taps. Wiring: new-link budget. */
  budget: number;
  /** Origin and Wiring: ticks T. */
  ticks: number;
  /** Origin: timed observation (first tick hidden). */
  timed: boolean;
}

export interface SandboxDoc {
  version: 1;
  graph: Graph;
  mode: ModeId;
  /** Marked nodes; their meaning depends on the mode (see markMeaning). */
  marks: number[];
  settings: SandboxSettings;
}

export const DEFAULT_SETTINGS: SandboxSettings = { k: 1, budget: 2, ticks: 2, timed: false };

export function emptyDoc(): SandboxDoc {
  return { version: 1, graph: { nodes: [], edges: [] }, mode: 'spread', marks: [], settings: { ...DEFAULT_SETTINGS } };
}

/** What marked nodes mean in each mode (null: the mode has no marks). */
export function markMeaning(mode: ModeId): { tool: string; hint: string; single?: boolean } | null {
  switch (mode) {
    case 'spread':
      return null;
    case 'threshold':
      return { tool: 'r', hint: `Tap a node to change its threshold r (1–${MAX_THRESHOLD}).` };
    case 'containment':
      return { tool: 'Fire', hint: 'Tap nodes to mark where orange starts.' };
    case 'rival':
      return { tool: 'Blue', hint: 'Tap nodes to mark where blue starts.' };
    case 'origin':
      return { tool: 'Source', hint: 'Tap nodes to mark the hidden sources.' };
    case 'wiring':
      return { tool: 'Seed', hint: 'Tap a node to make it the seed.', single: true };
  }
}

// ---------- Editing (each returns a new doc) ----------

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

function nextId(nodes: GraphNode[]): string {
  let max = -1;
  for (const v of nodes) {
    const m = /^n(\d+)$/.exec(v.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `n${max + 1}`;
}

function withGraph(doc: SandboxDoc, graph: Graph, marks = doc.marks): SandboxDoc {
  return { ...doc, graph, marks };
}

export function addNode(doc: SandboxDoc, x: number, y: number): SandboxDoc {
  if (doc.graph.nodes.length >= MAX_SANDBOX_NODES) return doc;
  const nodes = [...doc.graph.nodes, { id: nextId(doc.graph.nodes), x: round(clamp01(x)), y: round(clamp01(y)) }];
  return withGraph(doc, { nodes, edges: doc.graph.edges });
}

export function hasEdge(graph: Graph, a: number, b: number): boolean {
  return graph.edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

export function addEdge(doc: SandboxDoc, a: number, b: number): SandboxDoc {
  if (a === b || hasEdge(doc.graph, a, b)) return doc;
  return withGraph(doc, { nodes: doc.graph.nodes, edges: [...doc.graph.edges, [a, b]] });
}

export function moveNode(doc: SandboxDoc, i: number, x: number, y: number): SandboxDoc {
  const nodes = doc.graph.nodes.map((v, j) => (j === i ? { ...v, x: round(clamp01(x)), y: round(clamp01(y)) } : v));
  return withGraph(doc, { nodes, edges: doc.graph.edges });
}

/** Delete node i and its edges; later node indices shift down by one. */
export function deleteNode(doc: SandboxDoc, i: number): SandboxDoc {
  const shift = (v: number) => (v > i ? v - 1 : v);
  const nodes = doc.graph.nodes.filter((_, j) => j !== i);
  const edges = doc.graph.edges.filter(([a, b]) => a !== i && b !== i).map(([a, b]) => [shift(a), shift(b)] as [number, number]);
  const marks = doc.marks.filter((m) => m !== i).map(shift);
  return withGraph(doc, { nodes, edges }, marks);
}

export function deleteEdge(doc: SandboxDoc, index: number): SandboxDoc {
  return withGraph(doc, { nodes: doc.graph.nodes, edges: doc.graph.edges.filter((_, j) => j !== index) });
}

/** Mark tool: toggles a mark, or sets the single seed (Wiring), or cycles r (Threshold). */
export function markNode(doc: SandboxDoc, i: number): SandboxDoc {
  if (doc.mode === 'threshold') {
    const r = doc.graph.nodes[i].threshold ?? 1;
    const nodes = doc.graph.nodes.map((v, j) => (j === i ? { ...v, threshold: (r % MAX_THRESHOLD) + 1 } : v));
    return withGraph(doc, { nodes, edges: doc.graph.edges });
  }
  const meaning = markMeaning(doc.mode);
  if (!meaning) return doc;
  if (meaning.single) return { ...doc, marks: doc.marks[0] === i ? [] : [i] };
  return { ...doc, marks: doc.marks.includes(i) ? doc.marks.filter((m) => m !== i) : [...doc.marks, i] };
}

/** Replace the whole graph (generators, clear). Marks are dropped. */
export function replaceGraph(doc: SandboxDoc, graph: Graph): SandboxDoc {
  return withGraph(doc, graph, []);
}

// ---------- Generators ----------

export interface GeneratorParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
}

export interface GeneratorSpec {
  id: string;
  name: string;
  params: GeneratorParam[];
  build: (v: Record<string, number>, rand?: () => number) => Graph;
}

const p = (key: string, label: string, min: number, max: number, value: number, step = 1): GeneratorParam => ({ key, label, min, max, value, step });

export const GENERATORS: GeneratorSpec[] = [
  { id: 'path', name: 'Path', params: [p('n', 'Nodes', 2, 30, 6)], build: (v) => path(v.n) },
  { id: 'cycle', name: 'Cycle', params: [p('n', 'Nodes', 3, 30, 8)], build: (v) => cycle(v.n) },
  { id: 'star', name: 'Star', params: [p('n', 'Leaves', 2, 29, 6)], build: (v) => star(v.n) },
  { id: 'complete', name: 'Complete graph', params: [p('n', 'Nodes', 2, 12, 5)], build: (v) => complete(v.n) },
  {
    id: 'bipartite',
    name: 'Complete bipartite',
    params: [p('m', 'Top', 1, 10, 3), p('n', 'Bottom', 1, 10, 4)],
    build: (v) => completeBipartite(v.m, v.n),
  },
  { id: 'grid', name: 'Grid', params: [p('rows', 'Rows', 1, 8, 4), p('cols', 'Columns', 1, 8, 4)], build: (v) => grid(v.rows, v.cols) },
  { id: 'hypercube', name: 'Hypercube', params: [p('d', 'Dimension', 1, 5, 3)], build: (v) => hypercube(v.d) },
  { id: 'binaryTree', name: 'Binary tree', params: [p('levels', 'Levels', 1, 5, 4)], build: (v) => binaryTree(v.levels) },
  { id: 'petersen', name: 'Petersen graph', params: [], build: () => petersen() },
  {
    id: 'random',
    name: 'Random (Erdős–Rényi)',
    params: [p('n', 'Nodes', 2, 30, 10), p('p', 'Edge chance p', 0, 1, 0.3, 0.05)],
    build: (v, rand) => randomGraph(v.n, v.p, rand),
  },
];

/** Build a generator's graph, laid out in 0–1 with a little margin for editing. */
export function generate(spec: GeneratorSpec, values: Record<string, number>, rand?: () => number): Graph {
  const g = normalize(spec.build(values, rand));
  const inset = (v: number) => round(0.06 + v * 0.88);
  return { nodes: g.nodes.map((v) => ({ ...v, x: inset(v.x), y: inset(v.y) })), edges: g.edges };
}

// ---------- Import / export ----------

export function serialize(doc: SandboxDoc): string {
  return JSON.stringify(doc);
}

/**
 * Parse pasted JSON. Accepts a sandbox document, a level from the game files, or a bare
 * graph ({ nodes, edges }). Throws an Error with a readable message if it's invalid.
 */
export function parseImport(text: string): SandboxDoc {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That isn’t valid JSON.');
  }
  if (!isObject(data)) throw new Error('Expected a JSON object.');
  const rawGraph = isObject(data.graph) ? data.graph : data;
  const graph = parseGraph(rawGraph);
  const n = graph.nodes.length;
  const mode: ModeId = MODE_IDS.includes(data.mode as ModeId) ? (data.mode as ModeId) : 'spread';
  const settings: SandboxSettings = { ...DEFAULT_SETTINGS };
  let marks: number[] = [];

  if (isObject(data.settings)) {
    const s = data.settings;
    settings.k = intIn(s.k, 1, 10, settings.k);
    settings.budget = intIn(s.budget, 1, 20, settings.budget);
    settings.ticks = intIn(s.ticks, 1, 20, settings.ticks);
    settings.timed = s.timed === true;
  }
  if (Array.isArray(data.marks)) marks = data.marks as number[];
  // A level from the game: map its params onto marks and settings.
  if (isObject(data.params)) {
    const q = data.params;
    if (mode === 'containment') {
      marks = asArray(q.sources);
      settings.k = intIn(q.k, 1, 10, settings.k);
    }
    if (mode === 'rival') {
      marks = asArray(q.blue);
      settings.budget = intIn(q.budget, 1, 20, settings.budget);
    }
    if (mode === 'origin') {
      marks = asArray(q.seeds);
      settings.ticks = intIn(q.ticks, 1, 20, settings.ticks);
      settings.timed = q.timed === true;
    }
    if (mode === 'wiring') {
      marks = Number.isInteger(q.seed) ? [q.seed as number] : [];
      settings.ticks = intIn(q.ticks, 1, 20, settings.ticks);
      settings.budget = intIn(q.budget, 1, 20, settings.budget);
    }
  }
  marks = [...new Set(marks.filter((m) => Number.isInteger(m) && m >= 0 && m < n))];
  if (mode === 'wiring') marks = marks.slice(0, 1);
  return { version: 1, graph, mode, marks, settings };
}

function parseGraph(raw: Record<string, unknown>): Graph {
  if (!Array.isArray(raw.nodes)) throw new Error('Missing a "nodes" list.');
  if (raw.nodes.length === 0) throw new Error('The graph has no nodes.');
  if (raw.nodes.length > MAX_SANDBOX_NODES) throw new Error(`Too many nodes (the sandbox allows ${MAX_SANDBOX_NODES}).`);
  const nodes: GraphNode[] = raw.nodes.map((v, i) => {
    if (!isObject(v) || typeof v.x !== 'number' || typeof v.y !== 'number' || !isFinite(v.x) || !isFinite(v.y)) {
      throw new Error(`Node ${i} needs numeric x and y.`);
    }
    const out: GraphNode = { id: `n${i}`, x: v.x, y: v.y };
    if (Number.isInteger(v.threshold) && (v.threshold as number) >= 1) out.threshold = Math.min(MAX_THRESHOLD, v.threshold as number);
    return out;
  });
  const n = nodes.length;
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  for (const e of Array.isArray(raw.edges) ? raw.edges : []) {
    if (!Array.isArray(e) || e.length !== 2) throw new Error('Edges must be [a, b] pairs.');
    const [a, b] = e;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n) throw new Error(`Edge [${a}, ${b}] points to a missing node.`);
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (a === b || seen.has(key)) continue; // drop loops and duplicates quietly
    seen.add(key);
    edges.push([a, b]);
  }
  // Positions outside 0–1 (e.g. a hand-written graph) get rescaled to fit.
  const inRange = nodes.every((v) => v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1);
  return inRange ? { nodes, edges } : normalize({ nodes, edges });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function asArray(v: unknown): number[] {
  return Array.isArray(v) ? (v as number[]) : [];
}
function intIn(v: unknown, min: number, max: number, fallback: number): number {
  return Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : fallback;
}

// ---------- Playing and solving ----------

/** Why this doc can't be played yet, or null if it can. */
export function playProblem(doc: SandboxDoc): string | null {
  const n = doc.graph.nodes.length;
  if (n === 0) return 'Add some nodes first.';
  const s = doc.settings;
  switch (doc.mode) {
    case 'containment':
      if (!doc.marks.length) return 'Mark at least one fire node (Fire tool).';
      if (doc.marks.length === n) return 'Leave some nodes unmarked.';
      return null;
    case 'rival':
      if (!doc.marks.length) return 'Mark at least one blue node (Blue tool).';
      return null;
    case 'origin':
      if (!doc.marks.length) return 'Mark at least one hidden source (Source tool).';
      if (s.timed && s.ticks < 2) return 'Timed puzzles need at least 2 ticks.';
      return null;
    case 'wiring':
      if (!doc.marks.length) return 'Mark the seed (Seed tool).';
      return null;
    default:
      return null;
  }
}

/**
 * Turn the doc into a level. `target` is the solver's optimum (par / max saved / …), or
 * NaN if unknown; the game then just shows "?" and gives 1 star for finishing.
 */
export function docToLevel(doc: SandboxDoc, target = NaN): Level {
  const graph: Graph = { nodes: doc.graph.nodes.map((v) => ({ ...v })), edges: doc.graph.edges.map(([a, b]) => [a, b]) };
  const base = { id: 'sandbox', name: 'Your graph', graph };
  const s = doc.settings;
  switch (doc.mode) {
    case 'spread':
      return { ...base, mode: 'spread', params: {}, par: target };
    case 'threshold':
      graph.nodes.forEach((v) => (v.threshold = v.threshold ?? 1));
      return { ...base, mode: 'threshold', params: {}, par: target };
    case 'containment':
      return { ...base, mode: 'containment', params: { k: s.k, sources: [...doc.marks] }, optimum: target };
    case 'rival':
      return { ...base, mode: 'rival', params: { blue: [...doc.marks], budget: s.budget }, optimum: target };
    case 'origin':
      return {
        ...base,
        mode: 'origin',
        params: { size: doc.marks.length, ticks: s.ticks, timed: s.timed, hidden: s.timed ? 1 : 0, guesses: 3, seeds: [...doc.marks] },
        explanations: Number.isFinite(target) ? target : 1,
      };
    case 'wiring':
      return { ...base, mode: 'wiring', params: { seed: doc.marks[0], ticks: s.ticks, budget: s.budget }, optimum: target };
  }
}

export interface SolveResult {
  /** False if the graph is too large (or not set up) to solve exactly. */
  ok: boolean;
  /** One line for the player. */
  summary: string;
  /** The optimum used as par/goal when playing (Origin: number of valid answers). */
  target?: number;
  /** Nodes to highlight (seeds, protections, taps, …). */
  nodes?: number[];
  /** Edges to highlight (Wiring's new links). */
  edges?: [number, number][];
  /** Short labels for highlighted nodes (e.g. Containment's turn numbers). */
  labels?: Record<number, string>;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** Work caps for the enumerating solvers, so "Solve" never runs for minutes. */
const MAX_COMBINATIONS = 3_000_000;

function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

/** Exact optimum for the doc's mode. Runs in a Web Worker in the app. */
export function solveDoc(doc: SandboxDoc): SolveResult {
  const problem = playProblem(doc);
  if (problem) return { ok: false, summary: problem };
  const g = doc.graph;
  const n = g.nodes.length;
  const tooBig = (limit: number, what = 'nodes') => ({ ok: false, summary: `Too large to solve exactly: this solver handles up to ${limit} ${what} (the graph has ${n}).` });
  const s = doc.settings;

  switch (doc.mode) {
    case 'spread': {
      if (n > MAX_SOLVER_NODES) return tooBig(MAX_SOLVER_NODES);
      const r = solveSpread(g);
      return { ok: true, target: r.par, nodes: r.seeds, summary: `Par ${r.par}: tap the ${plural(r.seeds.length, 'ringed node')}, then ${plural(r.ticks, 'tick')}.` };
    }
    case 'threshold': {
      if (n > MAX_THRESHOLD_NODES) return tooBig(MAX_THRESHOLD_NODES);
      const r = solveThreshold(docToLevel(doc).graph);
      return { ok: true, target: r.par, nodes: r.seeds, summary: `Par ${r.par}: tap the ${plural(r.seeds.length, 'ringed node')}, then ${plural(r.ticks, 'tick')}.` };
    }
    case 'containment': {
      if (n > MAX_CONTAINMENT_NODES) return tooBig(MAX_CONTAINMENT_NODES);
      const r = solveContainment(g, doc.marks, s.k);
      const labels: Record<number, string> = {};
      r.plan.forEach((turn, i) => turn.forEach((v) => (labels[v] = String(i + 1))));
      const how = r.plan.length ? ' Protect the ringed nodes, in the numbered turn order.' : '';
      return { ok: true, target: r.optimum, nodes: r.plan.flat(), labels, summary: `Best: save ${r.optimum} of ${n}.${how}` };
    }
    case 'rival': {
      const free = n - doc.marks.length;
      if (choose(free, Math.min(s.budget, free)) > MAX_COMBINATIONS) return { ok: false, summary: 'Too large to solve exactly: too many ways to place the taps. Try fewer nodes or taps.' };
      const r = solveRival(g, doc.marks, s.budget);
      return { ok: true, target: r.optimum, nodes: r.seeds, summary: `Best: ${r.optimum} orange. Tap the ringed nodes before the first tick.` };
    }
    case 'origin': {
      const level = docToLevel(doc);
      if (level.mode !== 'origin') throw new Error('unreachable');
      const { ticks, hidden, timed } = level.params;
      const obs = observe(g, doc.marks, ticks, hidden, timed);
      const orange = obs.times.filter((t) => t !== null).length;
      if (choose(orange, doc.marks.length) > MAX_COMBINATIONS) return { ok: false, summary: 'Too large to solve exactly: too many possible source sets.' };
      const all = allExplanations(g, obs, doc.marks.length);
      return {
        ok: true,
        target: all.length,
        nodes: [...new Set(all.flat())],
        summary:
          all.length === 1
            ? 'Unique: only your sources explain this pattern.'
            : `${all.length} source sets explain this pattern (any is accepted). Ringed nodes appear in at least one.`,
      };
    }
    case 'wiring': {
      if (n > MAX_SOLVER_NODES) return tooBig(MAX_SOLVER_NODES);
      const r = solveWiring(g, { seed: doc.marks[0], ticks: s.ticks });
      const over = r.optimum > s.budget ? ` That's more than your budget of ${s.budget}.` : '';
      return {
        ok: true,
        target: r.optimum,
        edges: r.edges,
        summary: r.optimum === 0 ? 'Already done: everyone is within reach. Add more nodes or lower T.' : `Minimum: ${plural(r.optimum, 'new link')} (shown dashed).${over}`,
      };
    }
  }
}

// Generates the level JSON files in src/levels/: builds each graph, normalizes its
// layout, and precomputes the target score with the mode's solver.
// Run with `npm run levels`. Edit this script, not the JSON.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Graph } from '../src/core/graph';
import {
  barbell,
  binaryTree,
  bridgedClusters,
  complete,
  cycle,
  grid,
  hypercubeQ3,
  layeredTree,
  normalize,
  path,
  petersen,
  spider,
  star,
  wheel,
  withThresholds,
} from '../src/core/families';
import { solveContainment } from '../src/core/containmentSolver';
import { validateLevel, type ContainmentLevel, type Level, type OriginLevel, type RivalLevel, type SpreadLevel, type ThresholdLevel, type WiringLevel } from '../src/core/level';
import { solveSpread } from '../src/core/solver';
import { solveThreshold } from '../src/core/thresholdSolver';
import { allExplanations, observe } from '../src/core/origin';
import { solveRival } from '../src/core/rivalSolver';
import { solveWiring } from '../src/core/wiringSolver';

const pad = (i: number) => String(i + 1).padStart(2, '0');

function write(file: string, levels: Level[]) {
  levels.forEach(validateLevel);
  const out = fileURLToPath(new URL(`../src/levels/${file}`, import.meta.url));
  writeFileSync(out, JSON.stringify(levels) + '\n');
  console.log(`wrote ${levels.length} levels → ${out}\n`);
}

// ---------- Mode 1: Spread. Ordered to teach one idea at a time. ----------

const spreadSpecs: [name: string, graph: Graph][] = [
  ['Path P3', path(3)], // tap the middle, then tick
  ['Star K1,6', star(6)], // a hub reaches everything in one tick
  ['Path P5', path(5)], // ticks are cheaper than taps
  ['Complete graph K5', complete(5)], // everyone is a neighbor
  ['Cycle C6', cycle(6)], // two seeds on opposite sides
  ['Path P9', path(9)], // balance seeds against ticks
  ['Cycle C10', cycle(10)],
  ['Spider tree', spider(4, 3)], // sometimes one seed and patience wins
  ['Binary tree', binaryTree(4)],
  ['Grid 3×3', grid(3, 3)],
  ['Two clusters, one bridge', barbell(5, 0)],
  ['Hypercube Q3', hypercubeQ3()],
  ['Petersen graph', petersen()],
  ['Grid 4×6', grid(6, 4)],
  ['Two clusters, long bridge', barbell(6, 3)],
];

const spreadLevels: SpreadLevel[] = spreadSpecs.map(([name, g], i) => {
  const graph = normalize(g);
  const { par, ticks, seeds } = solveSpread(graph);
  console.log(`spread-${pad(i)}  ${name.padEnd(28)} n=${String(graph.nodes.length).padStart(2)}  par=${par}  (${seeds.length} seeds + ${ticks} ticks)`);
  return { id: `spread-${pad(i)}`, mode: 'spread', name, graph, params: {}, par };
});
write('spread.json', spreadLevels);

// ---------- Mode 2: Containment (firefighter problem). ----------

// A center triangle with three outer triangles, each behind a one-node bridge.
const clusterStar = bridgedClusters(
  [
    // One cluster above, two below: taller than wide, so it fits a portrait phone.
    { size: 3, cx: 0.5, cy: 0.5, r: 0.15 },
    { size: 3, cx: 0.5, cy: -0.2, r: 0.15 },
    { size: 3, cx: 0.85, cy: 1.106, r: 0.15 },
    { size: 3, cx: 0.15, cy: 1.106, r: 0.15 },
  ],
  [
    [0, 1, 1],
    [0, 2, 1],
    [0, 3, 1],
  ],
);

const containmentSpecs: [name: string, graph: Graph, sources: number[], k: number][] = [
  ['Path P7', path(7), [0], 1], // one shield next to the fire saves everything else
  ['Path P7', path(7), [3], 1], // block one side, then race the other
  ['Hub and spoke', star(7), [1], 1], // protect the hub
  ['Binary tree', binaryTree(3), [0], 1], // save the biggest branch first
  ['Hub and spokes', spider(4, 3), [0], 1], // longer spokes buy time further out
  ['Tree', layeredTree([-1, 0, 0, 1, 1, 2, 5, 5, 5]), [0], 1], // biggest branch first is wrong here
  ['Binary tree', binaryTree(4), [0], 1],
  ['Two clusters, one bridge', barbell(5, 2), [2], 1], // cut at the bottleneck
  ['Clusters around a hub', clusterStar, [0], 1], // three exits, one shield per turn
  ['Grid 4×4', grid(4, 4), [0], 1], // fire in a corner
  ['Tree with two fires', layeredTree([-1, 0, 0, 0, 1, 1, 2, 3, 4, 4, 5, 6, 7, 7, 10, 10, 11, 12]), [4, 7], 1],
  ['Grid 5×5', grid(5, 5), [12], 2], // fire in the middle, two shields per turn
];

const containmentLevels: ContainmentLevel[] = containmentSpecs.map(([name, g, sources, k], i) => {
  const graph = normalize(g);
  const t0 = performance.now();
  const { optimum, plan } = solveContainment(graph, sources, k);
  const ms = (performance.now() - t0).toFixed(0);
  const n = graph.nodes.length;
  console.log(
    `containment-${pad(i)}  ${name.padEnd(28)} n=${String(n).padStart(2)} k=${k}  optimum=${optimum}/${n - sources.length}  ${ms}ms  plan=${JSON.stringify(plan)}`,
  );
  return { id: `containment-${pad(i)}`, mode: 'containment', name, graph, params: { k, sources }, optimum };
});
write('containment.json', containmentLevels);

// ---------- Mode 3: Threshold (bootstrap percolation / target set selection). ----------

const all = (r: number) => () => r;
const ends1 = (n: number) => (v: number) => (v === 0 || v === n - 1 ? 1 : 2);

const thresholdSpecs: [name: string, graph: Graph][] = [
  ['Path P5', withThresholds(path(5), all(1))], // r = 1 everywhere: exactly like Spread
  ['Path P5', withThresholds(path(5), ends1(5))], // r = 2 needs two lit neighbors: seed 1 and 3
  ['Cycle C6', withThresholds(cycle(6), all(2))], // every other node
  ['Complete graph K5', withThresholds(complete(5), all(2))], // r seeds, then one tick
  // The hub (r = 1) lights up for free; seeding it wastes a move. Spread par here is 2.
  ['Wheel W6', withThresholds(wheel(6), (v) => (v === 0 ? 1 : v % 2 === 0 ? 3 : 2))],
  ['Grid 3×3', withThresholds(grid(3, 3), all(2))], // 2-neighbor bootstrap percolation
  ['Binary tree', withThresholds(binaryTree(4), (v) => (v < 7 ? 2 : 1))], // seed the middle layer
  // Hub joined to every other rim node. Seeding the hub is again a wasted move.
  ['Hub and ring', withThresholds(wheel(8, (i) => i % 2 === 1), (v) => (v === 0 ? 1 : v % 2 === 0 ? 2 : 1))],
  ['Two clusters, one bridge', withThresholds(barbell(5, 0), all(2))], // a single edge can't carry r = 2
  ['Hypercube Q3', withThresholds(hypercubeQ3(), all(2))],
  ['Petersen graph', withThresholds(petersen(), all(2))],
  ['Grid 4×4', withThresholds(grid(4, 4), all(2))],
  ['Grid 5×5', withThresholds(grid(5, 5), all(2))],
];

const thresholdLevels: ThresholdLevel[] = thresholdSpecs.map(([name, g], i) => {
  const graph = normalize(g);
  const t0 = performance.now();
  const { par, ticks, seeds } = solveThreshold(graph);
  const ms = (performance.now() - t0).toFixed(0);
  const spreadPar = solveSpread(graph).par;
  console.log(
    `threshold-${pad(i)}  ${name.padEnd(28)} n=${String(graph.nodes.length).padStart(2)}  par=${par}  (${seeds.length} seeds ${JSON.stringify(seeds)} + ${ticks} ticks)  spread-par=${spreadPar}  ${ms}ms`,
  );
  return { id: `threshold-${pad(i)}`, mode: 'threshold', name, graph, params: {}, par };
});
write('threshold.json', thresholdLevels);

// ---------- Mode 4: Rival (competitive diffusion). ----------

const rivalSpecs: [name: string, graph: Graph, blue: number[], budget: number][] = [
  ['Path P7', path(7), [0], 1], // block blue at the source
  ['Path P9', path(9), [4], 1], // blue in the middle: claim a side, don't race to a tie
  ['Hub and spoke', star(6), [1], 1], // grab the hub
  ['Wheel W8', wheel(8), [1], 1], // the hub again, but blue still gets its neighbors
  ['Cycle C10', cycle(10), [0, 5], 2], // two blue fronts
  ['Binary tree', binaryTree(4), [1], 2], // blue near the top: the root matters
  ['Two clusters, one bridge', barbell(5, 1), [2], 1], // own the bottleneck
  ['Grid 4×4', grid(4, 4), [0, 15], 2], // blue in two corners
  ['Petersen graph', petersen(), [0], 2],
  ['Grid 5×5', grid(5, 5), [6, 18], 2], // two blue fronts, two taps
];

const rivalLevels: RivalLevel[] = rivalSpecs.map(([name, g], i) => {
  const [, , blue, budget] = rivalSpecs[i];
  const graph = normalize(g);
  const t0 = performance.now();
  const { optimum, seeds } = solveRival(graph, blue, budget);
  const ms = (performance.now() - t0).toFixed(0);
  console.log(`rival-${pad(i)}  ${name.padEnd(28)} n=${String(graph.nodes.length).padStart(2)} budget=${budget}  optimum=${optimum}  taps=${JSON.stringify(seeds)}  ${ms}ms`);
  return { id: `rival-${pad(i)}`, mode: 'rival', name, graph, params: { blue, budget }, optimum };
});
write('rival.json', rivalLevels);

// ---------- Mode 5: Origin (source identification). ----------

// [name, graph, hidden seeds, total ticks, timed, hidden ticks]
const originSpecs: [string, Graph, number[], number, boolean, number][] = [
  ['Path P7', path(7), [3], 1, false, 0], // the middle of the orange run
  ['Cycle C10', cycle(10), [0], 2, false, 0],
  ['Grid 5×5', grid(5, 5), [12], 1, false, 0], // the center of the plus
  ['Petersen graph', petersen(), [0], 1, false, 0], // the one node next to all the others
  ['Binary tree', binaryTree(4), [1], 1, false, 0],
  ['Path P11', path(11), [2, 8], 1, false, 0], // two sources
  ['Grid 5×5', grid(5, 5), [6, 18], 1, false, 0],
  ['Grid 5×5', grid(5, 5), [0, 19], 2, false, 0], // overlapping diamonds
  ['Grid 5×5, timed', grid(5, 5), [12], 3, true, 1], // 0 = already orange when watching began
  ['Binary tree, timed', binaryTree(4), [3, 6], 3, true, 1],
];

const originLevels: OriginLevel[] = originSpecs.map(([name, g, seeds, ticks, timed, hidden], i) => {
  const graph = normalize(g);
  const obs = observe(graph, seeds, ticks, hidden, timed);
  const explanations = allExplanations(graph, obs, seeds.length);
  const orange = obs.times.filter((t) => t !== null).length;
  console.log(
    `origin-${pad(i)}  ${name.padEnd(28)} n=${String(graph.nodes.length).padStart(2)} s=${seeds.length} T=${ticks}${timed ? ` hidden=${hidden}` : ''}  orange=${orange}  explanations=${explanations.length} ${JSON.stringify(explanations.slice(0, 6))}`,
  );
  return {
    id: `origin-${pad(i)}`,
    mode: 'origin',
    name,
    graph,
    params: { size: seeds.length, ticks, timed, hidden, guesses: 3, seeds },
    explanations: explanations.length,
  };
});
write('origin.json', originLevels);

// ---------- Mode 6: Wiring (network design). ----------

const noEdges = (g: Graph): Graph => ({ nodes: g.nodes, edges: [] });
const withoutLastEdge = (g: Graph): Graph => ({ nodes: g.nodes, edges: g.edges.slice(0, -1) });
// A lone seed above three separate paths of 3 (drawn as columns).
const threePaths: Graph = {
  nodes: [
    { id: 'n0', x: 0.5, y: 0 },
    ...[0.15, 0.5, 0.85].flatMap((x, c) => [0.3, 0.6, 0.9].map((y, r) => ({ id: `n${1 + c * 3 + r}`, x, y }))),
  ],
  edges: [0, 1, 2].flatMap((c) => [
    [1 + c * 3, 2 + c * 3],
    [2 + c * 3, 3 + c * 3],
  ]) as [number, number][],
};

// [name, graph with fixed edges, seed, T, extra budget over the optimum]
const wiringSpecs: [string, Graph, number, number, number][] = [
  ['Path P5', path(5), 0, 2, 2], // one shortcut
  ['Five loose nodes', noEdges(wheel(4)), 0, 1, 0], // T = 1: a star from the seed
  ['Two clusters, no bridge', withoutLastEdge(barbell(4, 0)), 2, 2, 2],
  ['Cycle C8', cycle(8), 0, 2, 2], // cut across
  ['Path P9', path(9), 4, 2, 2],
  ['Three loose paths', threePaths, 0, 3, 2], // connect each to the seed at the right spot
  ['Cycle C12', cycle(12), 0, 2, 2],
  ['Binary tree', binaryTree(4), 7, 3, 2], // seed at a leaf
  ['Grid 4×4', grid(4, 4), 0, 3, 2], // seed in a corner
];

const wiringLevels: WiringLevel[] = wiringSpecs.map(([name, g, seed, ticks, slack], i) => {
  const graph = normalize(g);
  const t0 = performance.now();
  const { optimum, edges } = solveWiring(graph, { seed, ticks });
  const ms = (performance.now() - t0).toFixed(0);
  console.log(`wiring-${pad(i)}  ${name.padEnd(28)} n=${String(graph.nodes.length).padStart(2)} T=${ticks}  optimum=${optimum}  edges=${JSON.stringify(edges)}  ${ms}ms`);
  return { id: `wiring-${pad(i)}`, mode: 'wiring', name, graph, params: { seed, ticks, budget: optimum + slack }, optimum };
});
write('wiring.json', wiringLevels);

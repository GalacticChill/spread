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
import { validateLevel, type ContainmentLevel, type Level, type SpreadLevel, type ThresholdLevel } from '../src/core/level';
import { solveSpread } from '../src/core/solver';
import { solveThreshold } from '../src/core/thresholdSolver';

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

// Center cluster with three outer clusters, each behind a one-node bridge.
const clusterStar = bridgedClusters(
  [
    { size: 5, cx: 0.5, cy: 0.5, r: 0.16 },
    { size: 4, cx: 0.5, cy: -0.1, r: 0.13 },
    { size: 4, cx: 1.02, cy: 0.8, r: 0.13 },
    { size: 4, cx: -0.02, cy: 0.8, r: 0.13 },
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

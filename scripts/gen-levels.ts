// Generates src/levels/spread.json: builds each graph, normalizes its layout, and
// precomputes par with the solver. Run with `npm run levels`.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Graph } from '../src/core/graph';
import { barbell, binaryTree, complete, cycle, grid, hypercubeQ3, normalize, path, petersen, spider, star } from '../src/core/families';
import { validateLevel, type Level } from '../src/core/level';
import { solveSpread } from '../src/core/solver';

// Ordered to teach one idea at a time.
const specs: [name: string, graph: Graph][] = [
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

const levels: Level[] = specs.map(([name, g], i) => {
  const graph = normalize(g);
  const { par, ticks, seeds } = solveSpread(graph);
  const level: Level = { id: `spread-${String(i + 1).padStart(2, '0')}`, mode: 'spread', name, graph, params: {}, par };
  validateLevel(level);
  console.log(`${level.id}  ${name.padEnd(26)} n=${String(graph.nodes.length).padStart(2)}  par=${par}  (${seeds.length} seeds + ${ticks} ticks)`);
  return level;
});

const out = fileURLToPath(new URL('../src/levels/spread.json', import.meta.url));
writeFileSync(out, JSON.stringify(levels) + '\n');
console.log(`wrote ${levels.length} levels → ${out}`);

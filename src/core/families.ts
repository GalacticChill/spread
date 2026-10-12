// Generators for classic graph families, with layouts that make the structure
// recognizable. Positions are normalized to 0–1; the renderer fits the bounding box
// of the nodes to the screen with a uniform scale, so shapes are not distorted.

import type { Graph, GraphNode } from './graph';

const node = (i: number, x: number, y: number): GraphNode => ({ id: `n${i}`, x: round(x), y: round(y) });
const round = (v: number) => Math.round(v * 1000) / 1000;

/** Points on a circle, starting at the top and going clockwise. */
function ring(count: number, r: number, cx = 0.5, cy = 0.5, offset = 0): [number, number][] {
  return Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + offset + (2 * Math.PI * i) / count;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

/** Path on n nodes, drawn vertically (portrait screens have more height). */
export function path(n: number): Graph {
  const nodes = Array.from({ length: n }, (_, i) => node(i, 0.5, n === 1 ? 0.5 : i / (n - 1)));
  const edges = Array.from({ length: n - 1 }, (_, i) => [i, i + 1] as [number, number]);
  return { nodes, edges };
}

/** Cycle on n nodes, drawn as a regular polygon. */
export function cycle(n: number): Graph {
  const nodes = ring(n, 0.5).map(([x, y], i) => node(i, x, y));
  const edges = nodes.map((_, i) => [i, (i + 1) % n] as [number, number]);
  return { nodes, edges };
}

/** Star with one center (node 0) and `leaves` leaves around it. */
export function star(leaves: number): Graph {
  const nodes = [node(0, 0.5, 0.5), ...ring(leaves, 0.5).map(([x, y], i) => node(i + 1, x, y))];
  const edges = Array.from({ length: leaves }, (_, i) => [0, i + 1] as [number, number]);
  return { nodes, edges };
}

/** Complete graph K_n on a polygon. */
export function complete(n: number): Graph {
  const nodes = ring(n, 0.5).map(([x, y], i) => node(i, x, y));
  return { nodes, edges: allPairs(nodes.map((_, i) => i)) };
}

/** rows × cols grid graph. */
export function grid(rows: number, cols: number): Graph {
  const span = Math.max(rows, cols) - 1 || 1;
  const nodes: GraphNode[] = [];
  const edges: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      nodes.push(node(i, c / span, r / span));
      if (c > 0) edges.push([i - 1, i]);
      if (r > 0) edges.push([i - cols, i]);
    }
  }
  return { nodes, edges };
}

/** Complete binary tree with the given number of levels, root at the top. */
export function binaryTree(levels: number): Graph {
  const nodes: GraphNode[] = [];
  const edges: [number, number][] = [];
  const n = 2 ** levels - 1;
  for (let i = 0; i < n; i++) {
    const depth = Math.floor(Math.log2(i + 1));
    const posInRow = i + 1 - 2 ** depth;
    const x = (posInRow + 0.5) / 2 ** depth;
    nodes.push(node(i, x, depth / Math.max(1, levels - 1)));
    if (i > 0) edges.push([Math.floor((i - 1) / 2), i]);
  }
  return { nodes, edges };
}

/** Spider: a center (node 0) with `legs` paths of `length` nodes, drawn as rays. */
export function spider(legs: number, length: number): Graph {
  const nodes = [node(0, 0.5, 0.5)];
  const edges: [number, number][] = [];
  for (let l = 0; l < legs; l++) {
    const a = -Math.PI / 2 + (2 * Math.PI * l) / legs;
    for (let k = 1; k <= length; k++) {
      const i = nodes.length;
      const r = (0.5 * k) / length;
      nodes.push(node(i, 0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)));
      edges.push([k === 1 ? 0 : i - 1, i]);
    }
  }
  return { nodes, edges };
}

/**
 * Two complete clusters K_k stacked vertically, joined by a bridge path with
 * `bridge` intermediate nodes (0 = a single edge between the clusters).
 */
export function barbell(k: number, bridge: number): Graph {
  const gap = 0.28 * (bridge + 1);
  const r = 0.3;
  const topCy = r;
  const bottomCy = 2 * r + gap + r;
  // Rotate each polygon so one vertex points straight at the bridge.
  const top = ring(k, r, 0.5, topCy, Math.PI);
  const bottom = ring(k, r, 0.5, bottomCy);
  const nodes: GraphNode[] = [];
  top.forEach(([x, y]) => nodes.push(node(nodes.length, x, y)));
  const topIds = nodes.map((_, i) => i);
  // With the offset of π, index 0 sits at the bottom of the top cluster.
  const topAnchor = 0;
  const bridgeIds: number[] = [];
  for (let b = 1; b <= bridge; b++) {
    const y = topCy + r + (gap * b) / (bridge + 1);
    bridgeIds.push(nodes.length);
    nodes.push(node(nodes.length, 0.5, y));
  }
  const bottomIds: number[] = [];
  bottom.forEach(([x, y]) => {
    bottomIds.push(nodes.length);
    nodes.push(node(nodes.length, x, y));
  });
  const bottomAnchor = bottomIds[0]; // top vertex of the bottom cluster
  const chain = [topAnchor, ...bridgeIds, bottomAnchor];
  const edges: [number, number][] = [...allPairs(topIds), ...allPairs(bottomIds)];
  for (let i = 0; i + 1 < chain.length; i++) edges.push([chain[i], chain[i + 1]]);
  return { nodes, edges };
}

/** Hypercube Q3, drawn as the familiar cube projection (two offset squares). */
export function hypercubeQ3(): Graph {
  // Vertex i has bits (b2 b1 b0); b0 = x, b1 = y, b2 = depth (back square offset).
  const nodes = Array.from({ length: 8 }, (_, i) => {
    const bx = i & 1, by = (i >> 1) & 1, bz = (i >> 2) & 1;
    return node(i, 0.08 + bx * 0.6 + bz * 0.32, 0.4 + by * 0.6 - bz * 0.4);
  });
  const edges: [number, number][] = [];
  for (let i = 0; i < 8; i++) for (let bit = 0; bit < 3; bit++) {
    const j = i ^ (1 << bit);
    if (i < j) edges.push([i, j]);
  }
  return { nodes, edges };
}

/** Petersen graph: outer pentagon, inner pentagram, spokes between them. */
export function petersen(): Graph {
  const outer = ring(5, 0.5);
  const inner = ring(5, 0.22);
  const nodes = [...outer, ...inner].map(([x, y], i) => node(i, x, y));
  const edges: [number, number][] = [];
  for (let i = 0; i < 5; i++) {
    edges.push([i, (i + 1) % 5]); // outer cycle
    edges.push([i, i + 5]); // spoke
    edges.push([5 + i, 5 + ((i + 2) % 5)]); // inner pentagram
  }
  return { nodes, edges };
}

function allPairs(ids: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) out.push([ids[a], ids[b]]);
  return out;
}

/**
 * Rescale positions so the layout's bounding box fits in 0–1 (uniform scale, so the
 * shape keeps its proportions) and is centered on the shorter axis.
 */
export function normalize(graph: Graph): Graph {
  const xs = graph.nodes.map((v) => v.x);
  const ys = graph.nodes.map((v) => v.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const padX = (1 - (maxX - minX) / span) / 2;
  const padY = (1 - (maxY - minY) / span) / 2;
  return {
    nodes: graph.nodes.map((v) => ({ ...v, x: round(padX + (v.x - minX) / span), y: round(padY + (v.y - minY) / span) })),
    edges: graph.edges.map(([a, b]) => [a, b] as [number, number]),
  };
}

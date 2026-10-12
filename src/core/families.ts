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

/**
 * Rooted tree from a parent array (parent[0] = -1 for the root), drawn top-down:
 * leaves are spaced evenly and each parent sits centered over its children.
 */
export function layeredTree(parent: number[]): Graph {
  const n = parent.length;
  const children: number[][] = parent.map(() => []);
  const edges: [number, number][] = [];
  parent.forEach((p, i) => {
    if (p >= 0) {
      children[p].push(i);
      edges.push([p, i]);
    }
  });
  const depth = new Array<number>(n).fill(0);
  const x = new Array<number>(n).fill(0);
  let nextLeaf = 0;
  const place = (v: number, d: number) => {
    depth[v] = d;
    if (children[v].length === 0) {
      x[v] = nextLeaf++;
      return;
    }
    for (const c of children[v]) place(c, d + 1);
    x[v] = (x[children[v][0]] + x[children[v][children[v].length - 1]]) / 2;
  };
  place(0, 0);
  const maxDepth = Math.max(1, ...depth);
  const maxX = Math.max(1, nextLeaf - 1);
  return { nodes: x.map((xi, i) => node(i, xi / maxX, depth[i] / maxDepth)), edges };
}

export interface ClusterSpec {
  /** Number of nodes in this complete cluster. */
  size: number;
  cx: number;
  cy: number;
  r: number;
}

/**
 * Dense clusters (complete graphs drawn as small polygons) joined by bridge paths.
 * Each bridge [a, b, length] joins the vertex of cluster a closest to cluster b with
 * the vertex of cluster b closest to cluster a, through `length` intermediate nodes.
 * Node order: all cluster nodes (cluster by cluster), then bridge nodes.
 */
export function bridgedClusters(clusters: ClusterSpec[], bridges: [number, number, number][]): Graph {
  const nodes: GraphNode[] = [];
  const edges: [number, number][] = [];
  const members: number[][] = [];
  for (const c of clusters) {
    // Point one vertex at each neighboring cluster when possible: rotate the polygon
    // so vertex 0 faces the first cluster this one is bridged to.
    const partner = bridges.find(([a, b]) => clusters[a] === c || clusters[b] === c);
    let offset = 0;
    if (partner) {
      const other = clusters[clusters[partner[0]] === c ? partner[1] : partner[0]];
      offset = Math.atan2(other.cy - c.cy, other.cx - c.cx) + Math.PI / 2;
    }
    const ids = ring(c.size, c.r, c.cx, c.cy, offset).map(([x, y]) => {
      nodes.push(node(nodes.length, x, y));
      return nodes.length - 1;
    });
    members.push(ids);
    edges.push(...allPairs(ids));
  }
  const closest = (from: number, to: ClusterSpec) =>
    members[from].reduce((best, v) => (Math.hypot(nodes[v].x - to.cx, nodes[v].y - to.cy) < Math.hypot(nodes[best].x - to.cx, nodes[best].y - to.cy) ? v : best));
  for (const [a, b, length] of bridges) {
    const start = closest(a, clusters[b]);
    const end = closest(b, clusters[a]);
    let prev = start;
    for (let i = 1; i <= length; i++) {
      const t = i / (length + 1);
      nodes.push(node(nodes.length, nodes[start].x + (nodes[end].x - nodes[start].x) * t, nodes[start].y + (nodes[end].y - nodes[start].y) * t));
      edges.push([prev, nodes.length - 1]);
      prev = nodes.length - 1;
    }
    edges.push([prev, end]);
  }
  return { nodes, edges };
}

/**
 * Wheel: a hub (node 0) in the middle of a rim cycle of n nodes (1..n).
 * `spoke(i)` picks which rim nodes (0-based rim index) connect to the hub.
 */
export function wheel(n: number, spoke: (i: number) => boolean = () => true): Graph {
  const rim = ring(n, 0.5);
  const nodes = [node(0, 0.5, 0.5), ...rim.map(([x, y], i) => node(i + 1, x, y))];
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    edges.push([i + 1, ((i + 1) % n) + 1]);
    if (spoke(i)) edges.push([0, i + 1]);
  }
  return { nodes, edges };
}

/** Copy of a graph with per-node thresholds (Mode 3) set by a function of node index. */
export function withThresholds(graph: Graph, r: (v: number) => number): Graph {
  return { nodes: graph.nodes.map((v, i) => ({ ...v, threshold: r(i) })), edges: graph.edges.map(([a, b]) => [a, b] as [number, number]) };
}

/** Complete bipartite graph K_{m,n}: m nodes in a top row, n in a bottom row. */
export function completeBipartite(m: number, n: number): Graph {
  const row = (count: number, y: number, offset: number) =>
    Array.from({ length: count }, (_, i) => node(offset + i, count === 1 ? 0.5 : i / (count - 1), y));
  const nodes = [...row(m, 0, 0), ...row(n, 0.6, m)];
  const edges: [number, number][] = [];
  for (let a = 0; a < m; a++) for (let b = 0; b < n; b++) edges.push([a, m + b]);
  return { nodes, edges };
}

/**
 * Hypercube Q_d (2^d nodes; neighbors differ in one bit). Drawn by repeatedly copying
 * the previous cube and shifting the copy, the usual way cubes are sketched.
 */
export function hypercube(d: number): Graph {
  if (d === 3) return hypercubeQ3();
  const shifts: [number, number][] = [
    [1, 0],
    [0, 1],
    [0.45, -0.38],
    [1.9, 0.75],
    [-0.35, 2.3],
  ];
  const count = 2 ** d;
  const nodes = Array.from({ length: count }, (_, i) => {
    let x = 0, y = 0;
    for (let bit = 0; bit < d; bit++) if (i & (1 << bit)) {
      x += shifts[bit][0];
      y += shifts[bit][1];
    }
    return node(i, x, y);
  });
  const edges: [number, number][] = [];
  for (let i = 0; i < count; i++) for (let bit = 0; bit < d; bit++) {
    const j = i ^ (1 << bit);
    if (i < j) edges.push([i, j]);
  }
  return normalize({ nodes, edges });
}

/** Erdős–Rényi random graph G(n, p) on a circle. `rand` returns numbers in [0, 1). */
export function randomGraph(n: number, p: number, rand: () => number = Math.random): Graph {
  const nodes = (n === 1 ? [[0.5, 0.5] as [number, number]] : ring(n, 0.5)).map(([x, y], i) => node(i, x, y));
  const edges: [number, number][] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (rand() < p) edges.push([a, b]);
  return { nodes, edges };
}

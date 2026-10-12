// SVG game board: draws a graph, maps taps and drags to nodes/edges, and animates
// color changes. It only displays state; the rules live in src/core.

import type { Graph } from '../core/graph';
import { reducedMotion, s } from './dom';

/** How long the spread takes to travel along one edge during a tick (ms). */
const RIPPLE_MS = 260;
/** Largest distance between the two closest nodes (px), so tiny graphs don't sprawl. */
const MAX_GAP = 130;
/** How close (px) a tap must be to an added edge to select it. */
const EDGE_HIT = 16;

/**
 * How a node is drawn. Orange = active; blue = the opponent (Rival); gray =
 * protected/blocked/contested; white = selected.
 */
export type NodeColor = 'none' | 'orange' | 'blue' | 'gray' | 'white';

export interface BoardUpdate {
  colors: readonly NodeColor[];
  /** 'tick' animates `paths` as pulses along edges; 'tap' pops the tapped node. */
  animate?: 'tap' | 'tick' | 'none';
  paths?: [number, number][];
  tapped?: number;
  /** Marker classes on nodes that change during play, e.g. { wrong: [3, 5] }. */
  marks?: Record<string, number[]>;
  /** Edges added by the player (drawn on top of the fixed ones). */
  extraEdges?: readonly [number, number][];
}

export interface BoardOptions {
  onTapNode: (node: number) => void;
  /** Optional small text drawn inside each node (e.g. Threshold's r). */
  labels?: string[];
  /** If set, dragging from one node to another calls this (Wiring). */
  onDragEdge?: (a: number, b: number) => void;
  /** If set, tapping near an added edge calls this with its index (Wiring). */
  onTapEdge?: (index: number) => void;
}

export class Board {
  readonly el: SVGSVGElement;
  private edgeLayer = s('g', { class: 'edges' });
  private extraLayer = s('g', { class: 'edges extra' });
  private pulseLayer = s('g', { class: 'pulses' });
  private nodeLayer = s('g', { class: 'nodes' });
  private edgeEls: SVGLineElement[] = [];
  private extraEls: SVGLineElement[] = [];
  private extra: [number, number][] = [];
  private nodeEls: SVGGElement[] = [];
  private px: [number, number][] = [];
  private hitRadius = 24;
  private shown: NodeColor[] = [];
  private markClasses = new Set<string>();
  private timers: number[] = [];
  private observer: ResizeObserver;

  constructor(
    private graph: Graph,
    private opts: BoardOptions,
  ) {
    this.el = s('svg', { class: 'board', role: 'img', 'aria-label': 'Puzzle graph' }, this.edgeLayer, this.extraLayer, this.pulseLayer, this.nodeLayer);
    graph.edges.forEach(() => {
      const line = s('line', { class: 'edge' });
      this.edgeEls.push(line);
      this.edgeLayer.append(line);
    });
    const labels = opts.labels;
    graph.nodes.forEach((_, i) => {
      const label = labels?.[i] ? s('text', { class: 'label', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'aria-hidden': 'true' }, labels[i]) : null;
      const g = s('g', { class: 'node' }, s('circle', { class: 'halo' }), s('circle', { class: 'dot' }), label);
      this.nodeEls.push(g);
      this.nodeLayer.append(g);
    });
    this.shown = graph.nodes.map(() => 'none');

    this.el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(this.el);
  }

  destroy() {
    this.observer.disconnect();
    this.clearTimers();
  }

  private point(e: PointerEvent): [number, number] {
    const rect = this.el.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  /**
   * Hit-test by nearest node instead of the drawn circle, so every node has a
   * generous (≥ 44px) target even when the circle itself is small.
   */
  private nodeAt([x, y]: [number, number]): number {
    let best = -1;
    let bestD = this.hitRadius;
    this.px.forEach(([nx, ny], i) => {
      const d = Math.hypot(nx - x, ny - y);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  private onPointerDown(e: PointerEvent) {
    const p = this.point(e);
    const start = this.nodeAt(p);
    if (start >= 0 && !this.opts.onDragEdge) {
      e.preventDefault();
      this.opts.onTapNode(start);
      return;
    }
    if (start >= 0 && this.opts.onDragEdge) {
      e.preventDefault();
      this.dragFrom(start, e);
      return;
    }
    if (this.opts.onTapEdge) {
      const i = this.extraEdgeAt(p);
      if (i >= 0) {
        e.preventDefault();
        this.opts.onTapEdge(i);
      }
    }
  }

  /** Drag-to-connect: a dashed line follows the pointer; releasing on another node links them. */
  private dragFrom(start: number, down: PointerEvent) {
    const [x1, y1] = this.px[start];
    const line = s('line', { class: 'drag-line', x1, y1, x2: x1, y2: y1 });
    this.extraLayer.append(line);
    this.el.setPointerCapture(down.pointerId);
    const move = (e: PointerEvent) => {
      const [x, y] = this.point(e);
      const target = this.nodeAt([x, y]);
      // Snap to a node under the pointer so it's clear what will be connected.
      const [x2, y2] = target >= 0 && target !== start ? this.px[target] : [x, y];
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
    };
    const up = (e: PointerEvent) => {
      this.el.removeEventListener('pointermove', move);
      this.el.removeEventListener('pointerup', up);
      this.el.removeEventListener('pointercancel', up);
      line.remove();
      if (e.type === 'pointercancel') return;
      const end = this.nodeAt(this.point(e));
      if (end >= 0 && end !== start) this.opts.onDragEdge!(start, end);
    };
    this.el.addEventListener('pointermove', move);
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
  }

  private extraEdgeAt([x, y]: [number, number]): number {
    let best = -1;
    let bestD = EDGE_HIT;
    this.extra.forEach(([a, b], i) => {
      const d = segmentDistance(x, y, this.px[a], this.px[b]);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  /** Fit the graph's normalized 0–1 layout to the current pixel size of the board. */
  private layout() {
    const { width: w, height: h } = this.el.getBoundingClientRect();
    if (!w || !h) return;
    this.el.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const xs = this.graph.nodes.map((v) => v.x);
    const ys = this.graph.nodes.map((v) => v.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = Math.max(30, Math.min(w, h) * 0.08);
    // Closest pair in normalized units, used to stop small graphs from being blown up.
    let minNorm = Infinity;
    const nodes = this.graph.nodes;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) minNorm = Math.min(minNorm, Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y));
    // Uniform scale so shapes aren't stretched; capped so neighboring nodes are at most
    // MAX_GAP px apart and the whole board stays compact on desktop.
    const scale = Math.min(
      maxX > minX ? (w - 2 * pad) / (maxX - minX) : Infinity,
      maxY > minY ? (h - 2 * pad) / (maxY - minY) : Infinity,
      minNorm > 0 && isFinite(minNorm) ? MAX_GAP / minNorm : Infinity,
      560,
    );
    const ox = (w - (maxX - minX) * scale) / 2;
    const oy = (h - (maxY - minY) * scale) / 2;
    this.px = this.graph.nodes.map((v) => [ox + (v.x - minX) * scale, oy + (v.y - minY) * scale]);

    // Size nodes from the closest pair so dense graphs don't overlap.
    let minDist = Infinity;
    for (let i = 0; i < this.px.length; i++)
      for (let j = i + 1; j < this.px.length; j++) minDist = Math.min(minDist, Math.hypot(this.px[i][0] - this.px[j][0], this.px[i][1] - this.px[j][1]));
    if (!isFinite(minDist)) minDist = 80;
    // Labeled nodes need a little more room for the number.
    const r = Math.max(this.opts.labels ? 12 : 8, Math.min(18, minDist * 0.26));
    this.hitRadius = Math.max(24, minDist / 2);

    this.graph.edges.forEach(([a, b], i) => this.placeLine(this.edgeEls[i], a, b));
    this.extra.forEach(([a, b], i) => this.placeLine(this.extraEls[i], a, b));
    this.nodeEls.forEach((g, i) => {
      const [x, y] = this.px[i];
      for (const c of [g.children[0], g.children[1]]) {
        c.setAttribute('cx', String(x));
        c.setAttribute('cy', String(y));
        c.setAttribute('r', String(r));
      }
      const label = g.children[2];
      if (label) {
        label.setAttribute('x', String(x));
        label.setAttribute('y', String(y));
        label.setAttribute('font-size', String(Math.round(r * 1.05)));
      }
    });
  }

  private placeLine(line: SVGLineElement, a: number, b: number) {
    if (!this.px.length) return;
    line.setAttribute('x1', String(this.px[a][0]));
    line.setAttribute('y1', String(this.px[a][1]));
    line.setAttribute('x2', String(this.px[b][0]));
    line.setAttribute('y2', String(this.px[b][1]));
  }

  /** Show a new state. Pending animations from a previous update are finished instantly. */
  update({ colors, animate = 'none', paths = [], tapped, marks = {}, extraEdges }: BoardUpdate) {
    this.clearTimers();
    if (extraEdges) this.setExtraEdges(extraEdges);
    this.setMarks(marks);
    const motion = animate !== 'none' && !reducedMotion();

    if (motion && animate === 'tick' && paths.length) {
      // Ripple: a pulse travels along each edge, then the target node changes color.
      for (const [from, to] of paths) this.pulse(from, to, colors[from]);
      const arriving = new Set(paths.map(([, to]) => to));
      colors.forEach((c, i) => {
        if (!arriving.has(i)) this.setNode(i, c, false);
      });
      this.timers.push(
        window.setTimeout(() => {
          for (const i of arriving) this.setNode(i, colors[i], true);
          this.paintEdges();
        }, RIPPLE_MS * 0.85),
      );
    } else {
      colors.forEach((c, i) => this.setNode(i, c, motion && i === tapped));
    }
    this.paintEdges();
  }

  /** Add a permanent CSS class to some nodes (e.g. 'source' for where the fire started). */
  mark(nodes: number[], cls: string) {
    for (const i of nodes) this.nodeEls[i].classList.add(cls);
  }

  private setMarks(marks: Record<string, number[]>) {
    for (const cls of this.markClasses) for (const g of this.nodeEls) g.classList.remove(cls);
    for (const [cls, nodes] of Object.entries(marks)) {
      this.markClasses.add(cls);
      for (const i of nodes) this.nodeEls[i].classList.add(cls);
    }
  }

  private setExtraEdges(edges: readonly [number, number][]) {
    this.extra = edges.map(([a, b]) => [a, b]);
    while (this.extraEls.length < this.extra.length) {
      const line = s('line', { class: 'edge added' });
      this.extraEls.push(line);
      this.extraLayer.append(line);
    }
    while (this.extraEls.length > this.extra.length) this.extraEls.pop()!.remove();
    this.extra.forEach(([a, b], i) => this.placeLine(this.extraEls[i], a, b));
  }

  /** A celebratory wave across the whole graph when the puzzle is solved. */
  celebrate() {
    if (reducedMotion()) return;
    this.nodeEls.forEach((g, i) => {
      const delay = (this.px[i]?.[1] ?? 0) * 0.6;
      g.children[0].animate(
        [
          { opacity: 0.55, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(2.6)' },
        ],
        { duration: 700, delay, easing: 'ease-out' },
      );
    });
  }

  private setNode(i: number, color: NodeColor, pop: boolean) {
    const g = this.nodeEls[i];
    const was = this.shown[i];
    this.shown[i] = color;
    g.classList.toggle('on', color === 'orange');
    g.classList.toggle('blue', color === 'blue');
    g.classList.toggle('gray', color === 'gray');
    g.classList.toggle('white', color === 'white');
    if (pop && color !== 'none' && color !== was) {
      g.children[1].animate([{ transform: 'scale(0.6)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 280, easing: 'ease-out' });
      g.children[0].animate(
        [
          { opacity: 0.6, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(2.2)' },
        ],
        { duration: 520, easing: 'ease-out' },
      );
    }
  }

  /** Edges between two nodes of the same active color glow faintly. */
  private paintEdges() {
    const paint = (line: SVGLineElement, a: number, b: number) => {
      line.classList.toggle('on', this.shown[a] === 'orange' && this.shown[b] === 'orange');
      line.classList.toggle('blue', this.shown[a] === 'blue' && this.shown[b] === 'blue');
    };
    this.graph.edges.forEach(([a, b], i) => paint(this.edgeEls[i], a, b));
    this.extra.forEach(([a, b], i) => paint(this.extraEls[i], a, b));
  }

  private pulse(from: number, to: number, color: NodeColor) {
    const [x1, y1] = this.px[from];
    const [x2, y2] = this.px[to];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const line = s('line', { class: `pulse${color === 'blue' ? ' blue' : ''}`, x1, y1, x2, y2, 'stroke-dasharray': `${len} ${len}` });
    this.pulseLayer.append(line);
    const anim = line.animate(
      [
        { strokeDashoffset: len, opacity: 1 },
        { strokeDashoffset: 0, opacity: 1, offset: 0.75 },
        { strokeDashoffset: 0, opacity: 0 },
      ],
      { duration: RIPPLE_MS * 1.4, easing: 'ease-out' },
    );
    anim.onfinish = () => line.remove();
  }

  private clearTimers() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }
}

/** Distance from point (x, y) to the segment a–b. */
function segmentDistance(x: number, y: number, [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

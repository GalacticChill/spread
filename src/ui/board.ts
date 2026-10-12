// SVG game board: draws a graph, maps taps to nodes, and animates color changes.
// It only displays state; the rules live in src/core.

import type { Graph } from '../core/graph';
import { reducedMotion, s } from './dom';

/** How long the spread takes to travel along one edge during a tick (ms). */
const RIPPLE_MS = 260;
/** Largest distance between the two closest nodes (px), so tiny graphs don't sprawl. */
const MAX_GAP = 130;

export interface BoardUpdate {
  orange: readonly boolean[];
  /** 'tick' animates `paths` as pulses along edges; 'tap' pops the tapped node. */
  animate?: 'tap' | 'tick' | 'none';
  paths?: [number, number][];
  tapped?: number;
}

export class Board {
  readonly el: SVGSVGElement;
  private edgeLayer = s('g', { class: 'edges' });
  private pulseLayer = s('g', { class: 'pulses' });
  private nodeLayer = s('g', { class: 'nodes' });
  private edgeEls: SVGLineElement[] = [];
  private nodeEls: SVGGElement[] = [];
  private px: [number, number][] = [];
  private hitRadius = 24;
  private shown: boolean[] = [];
  private timers: number[] = [];
  private observer: ResizeObserver;

  constructor(
    private graph: Graph,
    private onTapNode: (node: number) => void,
  ) {
    this.el = s('svg', { class: 'board', role: 'img', 'aria-label': 'Puzzle graph' }, this.edgeLayer, this.pulseLayer, this.nodeLayer);
    graph.edges.forEach(() => {
      const line = s('line', { class: 'edge' });
      this.edgeEls.push(line);
      this.edgeLayer.append(line);
    });
    graph.nodes.forEach(() => {
      const g = s('g', { class: 'node' }, s('circle', { class: 'halo' }), s('circle', { class: 'dot' }));
      this.nodeEls.push(g);
      this.nodeLayer.append(g);
    });
    this.shown = graph.nodes.map(() => false);

    // Hit-test by nearest node instead of the drawn circle, so every node has a
    // generous (≥ 44px) target even when the circle itself is small.
    this.el.addEventListener('pointerdown', (e) => {
      const rect = this.el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      let best = -1;
      let bestD = this.hitRadius;
      this.px.forEach(([nx, ny], i) => {
        const d = Math.hypot(nx - x, ny - y);
        if (d <= bestD) {
          best = i;
          bestD = d;
        }
      });
      if (best >= 0) {
        e.preventDefault();
        this.onTapNode(best);
      }
    });

    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(this.el);
  }

  destroy() {
    this.observer.disconnect();
    this.clearTimers();
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
    const r = Math.max(8, Math.min(18, minDist * 0.26));
    this.hitRadius = Math.max(24, minDist / 2);

    this.graph.edges.forEach(([a, b], i) => {
      const line = this.edgeEls[i];
      line.setAttribute('x1', String(this.px[a][0]));
      line.setAttribute('y1', String(this.px[a][1]));
      line.setAttribute('x2', String(this.px[b][0]));
      line.setAttribute('y2', String(this.px[b][1]));
    });
    this.nodeEls.forEach((g, i) => {
      const [x, y] = this.px[i];
      for (const c of Array.from(g.children)) {
        c.setAttribute('cx', String(x));
        c.setAttribute('cy', String(y));
      }
      g.children[0].setAttribute('r', String(r));
      g.children[1].setAttribute('r', String(r));
    });
  }

  /** Show a new state. Pending animations from a previous update are finished instantly. */
  update({ orange, animate = 'none', paths = [], tapped }: BoardUpdate) {
    this.clearTimers();
    const motion = animate !== 'none' && !reducedMotion();

    if (motion && animate === 'tick' && paths.length) {
      // Ripple: a pulse travels along each edge, then the target node lights up.
      for (const [from, to] of paths) this.pulse(from, to);
      const arriving = new Set(paths.map(([, to]) => to));
      orange.forEach((on, i) => {
        if (!arriving.has(i)) this.setNode(i, on, false);
      });
      this.timers.push(
        window.setTimeout(() => {
          for (const i of arriving) this.setNode(i, orange[i], true);
          this.paintEdges();
        }, RIPPLE_MS * 0.85),
      );
    } else {
      orange.forEach((on, i) => this.setNode(i, on, motion && i === tapped));
    }
    this.paintEdges();
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

  private setNode(i: number, on: boolean, pop: boolean) {
    const g = this.nodeEls[i];
    const was = this.shown[i];
    this.shown[i] = on;
    g.classList.toggle('on', on);
    if (pop && on && !was) {
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

  /** Edges between two orange nodes glow faintly. Based on what's currently shown. */
  private paintEdges() {
    this.graph.edges.forEach(([a, b], i) => this.edgeEls[i].classList.toggle('on', this.shown[a] && this.shown[b]));
  }

  private pulse(from: number, to: number) {
    const [x1, y1] = this.px[from];
    const [x2, y2] = this.px[to];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const line = s('line', { class: 'pulse', x1, y1, x2, y2, 'stroke-dasharray': `${len} ${len}` });
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

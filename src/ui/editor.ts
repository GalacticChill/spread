// Sandbox editor canvas. Unlike the game Board it does NOT auto-fit the graph: node
// positions (0–1) map onto a fixed square, so adding or moving a node never shifts the
// others. It only draws and reports gestures; the sandbox screen updates the document.

import type { Graph } from '../core/graph';
import { s } from './dom';
import { glyphDiamond } from './board';
import { segmentDistance } from './geometry';

export type Tool = 'draw' | 'move' | 'erase' | 'mark';

export interface EditorView {
  graph: Graph;
  /** Marked nodes and how to draw them ('fire', 'blue', 'source', 'seed'). */
  marks: number[];
  markStyle: string;
  /** Show thresholds inside nodes. */
  showThresholds: boolean;
  /** Solver highlights. */
  hintNodes: number[];
  hintEdges: [number, number][];
  /** Small labels on hinted nodes (e.g. turn numbers). */
  hintLabels: Record<number, string>;
}

export interface EditorEvents {
  addNode: (x: number, y: number) => void;
  addEdge: (a: number, b: number) => void;
  /** Drag from a node into empty space: new node there, linked to `from`. */
  addLinkedNode: (from: number, x: number, y: number) => void;
  moveStart: (node: number) => void;
  move: (node: number, x: number, y: number) => void;
  deleteNode: (node: number) => void;
  deleteEdge: (index: number) => void;
  mark: (node: number) => void;
}

const NODE_R = 13;
const HIT = 24;
const EDGE_HIT = 14;
/** Movement (px) below which a press counts as a tap, not a drag. */
const TAP_SLOP = 10;

export class GraphEditor {
  readonly el: SVGSVGElement;
  tool: Tool = 'draw';
  private view: EditorView | null = null;
  private px: [number, number][] = [];
  private box = { ox: 0, oy: 0, side: 1 };
  private observer: ResizeObserver;

  constructor(private events: EditorEvents) {
    this.el = s('svg', { class: 'board editor', role: 'img', 'aria-label': 'Graph editor' });
    this.el.addEventListener('pointerdown', (e) => this.onDown(e));
    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(this.el);
  }

  destroy() {
    this.observer.disconnect();
  }

  render(view: EditorView) {
    this.view = view;
    this.draw();
  }

  /** Normalized (0–1) → pixels, inside a centered square with a margin. */
  private measure() {
    const { width: w, height: h } = this.el.getBoundingClientRect();
    const pad = 22;
    const side = Math.max(1, Math.min(w, h) - 2 * pad);
    this.box = { ox: (w - side) / 2, oy: (h - side) / 2, side };
    this.el.setAttribute('viewBox', `0 0 ${w || 1} ${h || 1}`);
  }

  private toPx(x: number, y: number): [number, number] {
    return [this.box.ox + x * this.box.side, this.box.oy + y * this.box.side];
  }

  private fromPx([x, y]: [number, number]): [number, number] {
    return [(x - this.box.ox) / this.box.side, (y - this.box.oy) / this.box.side];
  }

  private draw() {
    const view = this.view;
    if (!view) return;
    this.measure();
    this.px = view.graph.nodes.map((v) => this.toPx(v.x, v.y));
    const frame = s('rect', { class: 'editor-frame', x: this.box.ox - 8, y: this.box.oy - 8, width: this.box.side + 16, height: this.box.side + 16, rx: 12 });
    const edges = view.graph.edges.map(([a, b]) => s('line', { class: 'edge', ...this.line(a, b) }));
    const hints = view.hintEdges.map(([a, b]) => s('line', { class: 'edge hint-edge', ...this.line(a, b) }));
    const nodes = view.graph.nodes.map((v, i) => {
      const [x, y] = this.px[i];
      const marked = view.marks.includes(i);
      const cls = ['node', marked ? `mark-${view.markStyle}` : '', view.hintNodes.includes(i) ? 'hinted' : ''].join(' ');
      const r = view.showThresholds ? String(v.threshold ?? 1) : (view.hintLabels[i] ?? '');
      return s(
        'g',
        { class: cls },
        s('circle', { class: 'halo', cx: x, cy: y, r: NODE_R }),
        s('circle', { class: 'dot', cx: x, cy: y, r: NODE_R }),
        s('path', { class: 'glyph glyph-diamond', d: glyphDiamond(x, y, NODE_R) }),
        r ? s('text', { class: 'label', x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 13 }, r) : null,
      );
    });
    this.el.replaceChildren(frame, ...edges, ...hints, ...nodes);
  }

  private line(a: number, b: number) {
    return { x1: this.px[a][0], y1: this.px[a][1], x2: this.px[b][0], y2: this.px[b][1] };
  }

  private point(e: PointerEvent): [number, number] {
    const rect = this.el.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  private nodeAt([x, y]: [number, number]): number {
    let best = -1;
    let bestD = HIT;
    this.px.forEach(([nx, ny], i) => {
      const d = Math.hypot(nx - x, ny - y);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  private edgeAt([x, y]: [number, number]): number {
    let best = -1;
    let bestD = EDGE_HIT;
    this.view?.graph.edges.forEach(([a, b], i) => {
      const d = segmentDistance(x, y, this.px[a], this.px[b]);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  private onDown(e: PointerEvent) {
    if (!this.view) return;
    e.preventDefault();
    const start = this.point(e);
    const node = this.nodeAt(start);
    const inBox = (p: [number, number]) => {
      const [x, y] = this.fromPx(p);
      return x >= -0.02 && x <= 1.02 && y >= -0.02 && y <= 1.02;
    };

    if (this.tool === 'erase') {
      if (node >= 0) this.events.deleteNode(node);
      else {
        const edge = this.edgeAt(start);
        if (edge >= 0) this.events.deleteEdge(edge);
      }
      return;
    }
    if (this.tool === 'mark') {
      if (node >= 0) this.events.mark(node);
      return;
    }

    // Draw and Move follow the pointer until release.
    this.el.setPointerCapture(e.pointerId);
    let moved = false;
    let dragLine: SVGLineElement | null = null;
    if (this.tool === 'move' && node >= 0) this.events.moveStart(node);

    const move = (ev: PointerEvent) => {
      const p = this.point(ev);
      if (Math.hypot(p[0] - start[0], p[1] - start[1]) > TAP_SLOP) moved = true;
      if (this.tool === 'move' && node >= 0) {
        const [x, y] = this.fromPx(p);
        this.events.move(node, x, y);
      } else if (this.tool === 'draw' && node >= 0 && moved) {
        if (!dragLine) {
          dragLine = s('line', { class: 'drag-line', x1: this.px[node][0], y1: this.px[node][1] });
          this.el.append(dragLine);
        }
        const target = this.nodeAt(p);
        const [x2, y2] = target >= 0 && target !== node ? this.px[target] : p;
        dragLine.setAttribute('x2', String(x2));
        dragLine.setAttribute('y2', String(y2));
      }
    };
    const up = (ev: PointerEvent) => {
      this.el.removeEventListener('pointermove', move);
      this.el.removeEventListener('pointerup', up);
      this.el.removeEventListener('pointercancel', up);
      (dragLine as SVGLineElement | null)?.remove();
      if (ev.type === 'pointercancel' || this.tool !== 'draw') return;
      const p = this.point(ev);
      if (node < 0) {
        // Tap on empty space adds a node there.
        if (!moved && inBox(p)) this.events.addNode(...this.fromPx(p));
        return;
      }
      if (!moved) return;
      const target = this.nodeAt(p);
      if (target >= 0 && target !== node) this.events.addEdge(node, target);
      else if (target < 0 && inBox(p)) this.events.addLinkedNode(node, ...this.fromPx(p));
    };
    this.el.addEventListener('pointermove', move);
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
  }
}

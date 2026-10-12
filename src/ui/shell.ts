// Shared game screen used by every mode: top bar, stats, board, undo/tick/restart,
// keyboard shortcuts, saving results and the results card. Each mode plugs in its
// rules through the GameRules interface; the rules themselves live in src/core.

import { Board, type NodeColor } from './board';
import { h, icon, starRow } from './dom';
import { haptics } from './haptics';
import type { ModeInfo } from './modes';
import { showRules, topBar } from './screens';
import { recordResult } from './storage';

export interface Stat<S> {
  label: string;
  value: (state: S) => string;
  /** Dim the value when this returns true (e.g. moves over par). */
  dim?: (state: S) => boolean;
  /** Briefly highlight this stat when a tap is rejected (e.g. no shields left). */
  nudgeOnReject?: boolean;
}

export interface Result {
  /** Saved as the level's best score. */
  score: number;
  lowerIsBetter: boolean;
  /** 0 = the level was failed (nothing is saved). */
  stars: 0 | 1 | 2 | 3;
  title: string;
  detail: string;
}

export interface GameRules<S> {
  initial: () => S;
  /** New state after tapping a node, or null if the tap does nothing. */
  tap: (state: S, node: number) => S | null;
  tick: (state: S) => { state: S; paths: [number, number][] } | null;
  colors: (state: S) => NodeColor[];
  isFinished: (state: S) => boolean;
  stats: Stat<S>[];
  result: (state: S) => Result;
  /** Optional text inside each node (e.g. thresholds). */
  labels?: string[];
  /** Text on the main button (default "Tick"). */
  tickLabel?: string;
  /** A short line under the stats (e.g. "Pick 2 sources"). */
  message?: (state: S) => string;
  /** Marker classes on nodes, e.g. { wrong: [...] }. */
  marks?: (state: S) => Record<string, number[]>;
  /** Edges the player has added (Wiring). */
  extraEdges?: (state: S) => readonly [number, number][];
  /** Drag from node a to node b; null if not allowed. Enables drag-to-connect. */
  dragEdge?: (state: S, a: number, b: number) => S | null;
  /** Tap the i-th added edge; null if nothing happens. */
  tapEdge?: (state: S, index: number) => S | null;
  /**
   * When true, a tick can't be undone and Restart is hidden until the level ends
   * (Origin: otherwise undo/restart would refund guesses).
   */
  tickIsFinal?: boolean;
  /** Called once after the board is built (e.g. to mark the fire's sources). */
  setupBoard?: (board: Board) => void;
}

export function gameShell<S>(mode: ModeInfo, index: number, rules: GameRules<S>): { el: HTMLElement; destroy: () => void } {
  const level = mode.levels[index];
  const backHref = mode.backHref ?? `#/${mode.id}`;

  // Undo history: core states are immutable, so we can just keep the old ones.
  let history: S[] = [];
  let state = rules.initial();
  let finished = false;
  let resultsTimer = 0;

  /** Apply a player edit (tap, drag, edge tap) if the rules allow it. */
  const edit = (next: S | null, tapped?: number) => {
    if (finished) return;
    if (!next) {
      nudge();
      return;
    }
    history.push(state);
    state = next;
    haptics.tap();
    render({ animate: 'tap', tapped });
    afterMove();
  };

  const board = new Board(level.graph, {
    labels: rules.labels,
    onTapNode: (node) => edit(rules.tap(state, node), node),
    onDragEdge: rules.dragEdge && ((a, b) => edit(rules.dragEdge!(state, a, b))),
    onTapEdge: rules.tapEdge && ((i) => edit(rules.tapEdge!(state, i))),
  });

  function render(extra: { animate?: 'tap' | 'tick' | 'none'; tapped?: number; paths?: [number, number][] } = {}) {
    board.update({ colors: rules.colors(state), marks: rules.marks?.(state), extraEdges: rules.extraEdges?.(state), ...extra });
  }
  rules.setupBoard?.(board);

  const statEls = rules.stats.map((stat) => {
    const value = h('span', { class: 'stat-value' });
    const el = h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, stat.label), value);
    return { stat, el, value };
  });

  const undoBtn = h('button', { class: 'icon-btn ctrl', 'aria-label': 'Undo', onclick: undo }, icon('undo'));
  const restartBtn = h('button', { class: 'icon-btn ctrl', 'aria-label': 'Restart', onclick: restart }, icon('restart'));
  const tickBtn = h('button', { class: 'btn tick', onclick: doTick }, rules.tickLabel ?? 'Tick');
  const messageEl = h('p', { class: 'hint' });

  const title = mode.sandbox
    ? h('div', {}, h('div', {}, 'Sandbox'), h('div', { class: 'family' }, mode.title))
    : h('div', {}, h('div', {}, `Level ${index + 1}`), h('div', { class: 'family' }, level.name));
  const help = h('button', { class: 'icon-btn', 'aria-label': 'Rules', onclick: () => showRules(mode) }, icon('help'));

  const el = h(
    'main',
    { class: `screen game mode-${mode.id}` },
    topBar(backHref, title, help),
    h('div', { class: 'stats' }, ...statEls.map((s) => s.el)),
    rules.message ? messageEl : null,
    h('div', { class: 'board-wrap' }, board.el),
    h('footer', { class: 'controls' }, undoBtn, tickBtn, restartBtn),
  );

  function doTick() {
    if (finished) return;
    const result = rules.tick(state);
    if (!result) {
      nudge();
      return;
    }
    if (rules.tickIsFinal) history = [];
    else history.push(state);
    state = result.state;
    haptics.tick();
    render({ animate: 'tick', paths: result.paths });
    afterMove();
  }

  function undo() {
    const prev = history.pop();
    if (!prev || finished) return;
    state = prev;
    render();
    refresh();
  }

  function restart() {
    if (rules.tickIsFinal && !finished) return;
    clearTimeout(resultsTimer);
    history = [];
    finished = false;
    state = rules.initial();
    render();
    document.querySelector('.overlay.results')?.remove();
    refresh();
  }

  function nudge() {
    for (const s of statEls) {
      if (!s.stat.nudgeOnReject) continue;
      s.el.classList.remove('nudge');
      void s.el.getBoundingClientRect(); // restart the CSS animation
      s.el.classList.add('nudge');
    }
  }

  function refresh() {
    for (const s of statEls) {
      s.value.textContent = s.stat.value(state);
      s.value.classList.toggle('over', !!s.stat.dim?.(state));
    }
    undoBtn.disabled = history.length === 0 || finished;
    restartBtn.disabled = (history.length === 0 && !finished) || (!!rules.tickIsFinal && !finished);
    tickBtn.disabled = finished;
    if (rules.message) messageEl.textContent = rules.message(state);
  }

  function afterMove() {
    refresh();
    if (!rules.isFinished(state)) return;
    finished = true;
    const result = rules.result(state);
    const newBest = result.stars > 0 && !mode.sandbox && recordResult(level.id, result.score, result.stars, result.lowerIsBetter);
    refresh(); // after saving, so a "Best" stat shows the new score
    render(); // the final state may look different (e.g. Origin reveals the sources)
    // Let the last ripple land before the results card appears.
    resultsTimer = window.setTimeout(() => {
      if (result.stars > 0) {
        haptics.win();
        board.celebrate();
      }
      showResults(result, newBest);
    }, 420);
  }

  function showResults(result: Result, newBest: boolean) {
    const hasNext = index + 1 < mode.levels.length;
    const failed = result.stars === 0;
    const overlay = h(
      'div',
      { class: 'overlay results', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Level complete' },
      h(
        'div',
        { class: 'card results-card' },
        starRow(result.stars, 40),
        h('h2', {}, result.title),
        h('p', { class: 'score' }, result.detail),
        newBest ? h('p', { class: 'new-best' }, 'New best') : null,
        h(
          'div',
          { class: 'btn-row' },
          failed
            ? h('a', { class: 'btn', href: backHref }, mode.sandbox ? 'Edit graph' : 'All levels')
            : h('button', { class: 'btn', onclick: restart }, 'Retry'),
          failed
            ? h('button', { class: 'btn primary', onclick: restart }, 'Try again')
            : mode.sandbox
              ? h('a', { class: 'btn primary', href: backHref }, 'Edit graph')
              : h('a', { class: 'btn primary', href: hasNext ? `#/${mode.id}/${index + 2}` : `#/${mode.id}` }, hasNext ? 'Next level' : 'All levels'),
        ),
      ),
    );
    document.body.append(overlay);
    (overlay.querySelector('.btn.primary') as HTMLElement).focus();
  }

  // Keyboard shortcuts on desktop: space/enter/t = tick, z/backspace = undo, r = restart.
  const onKey = (e: KeyboardEvent) => {
    if (document.querySelector('.overlay')) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 't') {
      e.preventDefault();
      doTick();
    } else if (e.key === 'z' || e.key === 'Backspace') undo();
    else if (e.key === 'r') restart();
  };
  window.addEventListener('keydown', onKey);

  refresh();
  render();
  // A level could in principle start already finished (nothing can spread).
  if (rules.isFinished(state)) afterMove();

  return {
    el,
    destroy: () => {
      clearTimeout(resultsTimer);
      board.destroy();
      window.removeEventListener('keydown', onKey);
    },
  };
}

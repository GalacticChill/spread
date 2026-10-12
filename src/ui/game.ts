// Game screen for Mode 1 (Spread): board, move counter, undo/restart/tick, results.

import { adjacency } from '../core/graph';
import { initialState, isComplete, starsFor, tap, tick, type SpreadState } from '../core/spread';
import { Board } from './board';
import { h, icon, starRow } from './dom';
import { haptics } from './haptics';
import type { ModeInfo } from './modes';
import { showRules, topBar } from './screens';
import { progressFor, recordResult } from './storage';

export function gameScreen(mode: ModeInfo, index: number): { el: HTMLElement; destroy: () => void } {
  const level = mode.levels[index];
  const graph = level.graph;
  const adj = adjacency(graph);

  // Undo history: core states are immutable, so we can just keep the old ones.
  let history: SpreadState[] = [];
  let state = initialState(graph);
  let finished = false;
  let resultsTimer = 0;

  const board = new Board(graph, (node) => {
    if (finished || state.orange[node]) return;
    history.push(state);
    state = tap(state, node);
    haptics.tap();
    board.update({ orange: state.orange, animate: 'tap', tapped: node });
    afterMove();
  });

  const movesEl = h('span', { class: 'stat-value' }, '0');
  const best = progressFor(level.id);
  const stats = h(
    'div',
    { class: 'stats' },
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Moves'), movesEl),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Par'), h('span', { class: 'stat-value' }, String(level.par))),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Best'), h('span', { class: 'stat-value' }, best ? String(best.best) : '–')),
  );

  const undoBtn = h('button', { class: 'icon-btn ctrl', 'aria-label': 'Undo', onclick: undo }, icon('undo'));
  const restartBtn = h('button', { class: 'icon-btn ctrl', 'aria-label': 'Restart', onclick: restart }, icon('restart'));
  const tickBtn = h('button', { class: 'btn tick', onclick: doTick }, 'Tick');

  const title = h('div', {}, h('div', {}, `Level ${index + 1}`), h('div', { class: 'family' }, level.name));
  const help = h('button', { class: 'icon-btn', 'aria-label': 'Rules', onclick: () => showRules(mode) }, icon('help'));

  const el = h(
    'main',
    { class: 'screen game' },
    topBar(`#/${mode.id}`, title, help),
    stats,
    h('div', { class: 'board-wrap' }, board.el),
    h('footer', { class: 'controls' }, undoBtn, tickBtn, restartBtn),
  );

  function doTick() {
    if (finished) return;
    history.push(state);
    const result = tick(graph, state, adj);
    state = result.state;
    haptics.tick();
    board.update({ orange: state.orange, animate: 'tick', paths: result.paths });
    afterMove();
  }

  function undo() {
    const prev = history.pop();
    if (!prev || finished) return;
    state = prev;
    board.update({ orange: state.orange });
    refresh();
  }

  function restart() {
    clearTimeout(resultsTimer);
    history = [];
    finished = false;
    state = initialState(graph);
    board.update({ orange: state.orange });
    document.querySelector('.overlay.results')?.remove();
    refresh();
  }

  function refresh() {
    movesEl.textContent = String(state.moves);
    movesEl.classList.toggle('over', state.moves > level.par);
    undoBtn.disabled = history.length === 0 || finished;
    restartBtn.disabled = state.moves === 0 && !finished;
    tickBtn.disabled = finished;
  }

  function afterMove() {
    refresh();
    if (!isComplete(state)) return;
    finished = true;
    refresh();
    const stars = starsFor(state.moves, level.par);
    const newBest = recordResult(level.id, state.moves, stars);
    // Let the last ripple land before the results card appears.
    resultsTimer = window.setTimeout(() => {
      haptics.win();
      board.celebrate();
      showResults(stars, newBest);
    }, 420);
  }

  function showResults(stars: number, newBest: boolean) {
    const hasNext = index + 1 < mode.levels.length;
    const message = state.moves < level.par ? 'Better than par!' : state.moves === level.par ? 'Optimal' : state.moves === level.par + 1 ? 'One move off par' : 'Solved';
    const overlay = h(
      'div',
      { class: 'overlay results', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Level complete' },
      h(
        'div',
        { class: 'card results-card' },
        starRow(stars, 40),
        h('h2', {}, message),
        h('p', { class: 'score' }, `${state.moves} moves · par ${level.par}`),
        newBest ? h('p', { class: 'new-best' }, 'New best') : null,
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn', onclick: restart }, 'Retry'),
          h('a', { class: 'btn primary', href: hasNext ? `#/${mode.id}/${index + 2}` : `#/${mode.id}` }, hasNext ? 'Next level' : 'All levels'),
        ),
      ),
    );
    document.body.append(overlay);
    (overlay.querySelector('.btn.primary') as HTMLElement).focus();
  }

  // Keyboard shortcuts on desktop: space/enter = tick, z/backspace = undo, r = restart.
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
  board.update({ orange: state.orange });

  return {
    el,
    destroy: () => {
      clearTimeout(resultsTimer);
      board.destroy();
      window.removeEventListener('keydown', onKey);
    },
  };
}

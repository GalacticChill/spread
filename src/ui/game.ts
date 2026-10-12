// Game screens for each mode: plug the pure rules from src/core into the shared shell.

import { canSpread, containmentStars, initialState as containmentInitial, ORANGE, PROTECTED, savedCount, shieldsLeft, tick as containmentTick, toggleProtect, type ContainmentState } from '../core/containment';
import { adjacency } from '../core/graph';
import type { ContainmentLevel, OriginLevel, RivalLevel, SpreadLevel, ThresholdLevel, WiringLevel } from '../core/level';
import * as origin from '../core/origin';
import * as rival from '../core/rival';
import * as wiring from '../core/wiring';
import { initialState as spreadInitial, isComplete, starsFor, tap, tick as spreadTick, type SpreadState } from '../core/spread';
import { thresholdOf, thresholdTick } from '../core/threshold';
import type { NodeColor } from './board';
import type { ModeInfo } from './modes';
import { gameShell } from './shell';
import { progressFor } from './storage';

/** Targets are NaN for sandbox graphs too large to solve; show them as "?". */
const fmt = (n: number) => (Number.isFinite(n) ? String(n) : '?');

export function gameScreen(mode: ModeInfo, index: number) {
  const level = mode.levels[index];
  switch (level.mode) {
    case 'spread':
      return spreadGame(mode, index, level);
    case 'containment':
      return containmentGame(mode, index, level);
    case 'threshold':
      return spreadGame(mode, index, level);
    case 'rival':
      return rivalGame(mode, index, level);
    case 'origin':
      return originGame(mode, index, level);
    case 'wiring':
      return wiringGame(mode, index, level);
  }
}

/**
 * Spread and Threshold share everything except the tick: Threshold nodes only light
 * up once r of their neighbors are orange, and show r inside the circle.
 */
function spreadGame(mode: ModeInfo, index: number, level: SpreadLevel | ThresholdLevel) {
  const graph = level.graph;
  const adj = adjacency(graph);
  const isThreshold = level.mode === 'threshold';
  return gameShell<SpreadState>(mode, index, {
    initial: () => spreadInitial(graph),
    tap: (s, node) => (s.orange[node] ? null : tap(s, node)),
    tick: (s) => {
      const r = isThreshold ? thresholdTick(graph, s, adj) : spreadTick(graph, s, adj);
      return { state: r.state, paths: r.paths };
    },
    labels: isThreshold ? graph.nodes.map((_, v) => String(thresholdOf(graph, v))) : undefined,
    colors: (s) => s.orange.map((on): NodeColor => (on ? 'orange' : 'none')),
    isFinished: isComplete,
    stats: [
      { label: 'Moves', value: (s) => String(s.moves), dim: (s) => s.moves > level.par },
      { label: 'Par', value: () => fmt(level.par) },
      { label: 'Best', value: () => String(progressFor(level.id)?.best ?? '–') },
    ],
    result: (s) => {
      const p = level.par;
      return {
        score: s.moves,
        lowerIsBetter: true,
        stars: starsFor(s.moves, p),
        title: s.moves < p ? 'Better than par!' : s.moves === p ? 'Optimal' : s.moves === p + 1 ? 'One move off par' : 'Solved',
        detail: `${s.moves} moves · par ${fmt(p)}`,
      };
    },
  });
}

function containmentGame(mode: ModeInfo, index: number, level: ContainmentLevel) {
  const graph = level.graph;
  const adj = adjacency(graph);
  const { k, sources } = level.params;
  const n = graph.nodes.length;
  const best = level.optimum;
  return gameShell<ContainmentState>(mode, index, {
    initial: () => containmentInitial(graph, sources, k),
    tap: (s, node) => {
      const next = toggleProtect(graph, s, node, adj);
      return next === s ? null : next;
    },
    tick: (s) => {
      const r = containmentTick(graph, s, adj);
      return { state: r.state, paths: r.paths };
    },
    // Protections placed this turn are "selected" (white) until the tick makes them
    // permanent, or until the game ends.
    colors: (s) => {
      const over = !canSpread(graph, s, adj);
      return s.status.map((st, v): NodeColor => (st === ORANGE ? 'orange' : st === PROTECTED ? (s.placed.includes(v) && !over ? 'white' : 'gray') : 'none'));
    },
    isFinished: (s) => !canSpread(graph, s, adj),
    stats: [
      { label: 'Saved', value: (s) => String(savedCount(s)), dim: (s) => savedCount(s) < best },
      { label: 'Goal', value: () => fmt(best) },
      { label: 'Shields', value: (s) => `${shieldsLeft(s)}/${k}`, dim: (s) => shieldsLeft(s) === 0, nudgeOnReject: true },
    ],
    result: (s) => {
      const saved = savedCount(s);
      return {
        score: saved,
        lowerIsBetter: false,
        stars: containmentStars(saved, best),
        title: saved >= best ? 'Optimal' : saved === best - 1 ? 'One node short' : 'Contained',
        detail: `Saved ${saved} of ${n} · best possible ${fmt(best)}`,
      };
    },
    setupBoard: (board) => board.mark(sources, 'source'),
  });
}

function rivalGame(mode: ModeInfo, index: number, level: RivalLevel) {
  const graph = level.graph;
  const adj = adjacency(graph);
  const { blue, budget } = level.params;
  const best = level.optimum;
  const toColor: Record<rival.RivalStatus, NodeColor> = { [rival.FREE]: 'none', [rival.ORANGE]: 'orange', [rival.BLUE]: 'blue', [rival.GRAY]: 'gray' };
  return gameShell<rival.RivalState>(mode, index, {
    initial: () => rival.initialState(graph, blue, budget),
    tap: (s, node) => {
      const next = rival.tap(s, node);
      return next === s ? null : next;
    },
    tick: (s) => rival.tick(graph, s, adj),
    colors: (s) => s.status.map((st) => toColor[st]),
    isFinished: (s) => rival.isOver(graph, s, adj),
    stats: [
      { label: 'Orange', value: (s) => String(rival.orangeCount(s)) },
      { label: 'Goal', value: () => fmt(best) },
      { label: 'Taps', value: (s) => String(s.tapsLeft), dim: (s) => s.tapsLeft === 0, nudgeOnReject: true },
    ],
    result: (s) => {
      const n = rival.orangeCount(s);
      return {
        score: n,
        lowerIsBetter: false,
        stars: rival.rivalStars(n, best),
        title: n >= best ? 'Optimal' : n === best - 1 ? 'One node short' : 'Done',
        detail: `${n} orange · best possible ${fmt(best)}`,
      };
    },
    setupBoard: (board) => board.mark(blue, 'source'),
  });
}

function originGame(mode: ModeInfo, index: number, level: OriginLevel) {
  const graph = level.graph;
  const adj = adjacency(graph);
  const { size, ticks, timed, hidden, guesses, seeds } = level.params;
  const obs = origin.observe(graph, seeds, ticks, hidden, timed, adj);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : word.endsWith('s') ? 'es' : 's'}`;
  return gameShell<origin.OriginState>(mode, index, {
    initial: () => origin.initialState(guesses),
    tap: (s, node) => {
      const next = origin.toggleSelect(s, node, obs, size);
      return next === s ? null : next;
    },
    tick: (s) => {
      const next = origin.submit(graph, s, obs, size, adj);
      return next === s ? null : { state: next, paths: [] };
    },
    tickLabel: 'Check',
    tickIsFinal: true,
    // The observation stays visible; selected suspects are white. If the player runs out
    // of guesses, the original sources are revealed instead.
    colors: (s) => {
      const failed = origin.isOver(s) && !s.solved;
      const picked = failed ? seeds : s.selected;
      return obs.times.map((t, v): NodeColor => (picked.includes(v) ? 'white' : t !== null ? 'orange' : 'none'));
    },
    marks: (s) => ({ wrong: s.solved ? [] : [...s.wrong] }),
    labels: timed ? obs.times.map((t) => (t === null ? '' : String(t))) : undefined,
    message: (s) => {
      if (s.wrong.length && !origin.isOver(s)) return `Not quite: ringed nodes would come out different.`;
      const base = `Spread ran ${plural(ticks, 'tick')} from ${plural(size, 'hidden source')}.`;
      return timed ? `${base} Numbers: tick each node turned orange, counting from tick ${hidden}.` : base;
    },
    isFinished: origin.isOver,
    stats: [
      { label: 'Sources', value: (s) => `${s.selected.length}/${size}`, nudgeOnReject: true },
      { label: 'Ticks', value: () => String(ticks) },
      { label: 'Guesses', value: (s) => String(s.guessesLeft), dim: (s) => s.guessesLeft === 1 },
    ],
    result: (s) => {
      if (!s.solved) return { score: 0, lowerIsBetter: true, stars: 0, title: 'Out of guesses', detail: 'The original sources are shown in white.' };
      const stars = origin.originStars(s.guessesUsed);
      return {
        score: s.guessesUsed,
        lowerIsBetter: true,
        stars,
        title: s.guessesUsed === 1 ? 'First try' : 'Found it',
        detail: `${plural(s.guessesUsed, 'guess')}${level.explanations > 1 ? ` · ${level.explanations} possible answers` : ''}`,
      };
    },
  });
}

function wiringGame(mode: ModeInfo, index: number, level: WiringLevel) {
  const graph = level.graph;
  const p = level.params;
  const best = level.optimum;
  return gameShell<wiring.WiringState>(mode, index, {
    initial: () => wiring.initialState(graph, p),
    tap: () => null, // nodes are dragged, not tapped
    dragEdge: (s, a, b) => {
      const next = wiring.addEdge(graph, s, a, b, p);
      return next === s ? null : next;
    },
    tapEdge: (s, i) => {
      const next = wiring.removeEdge(graph, s, i, p);
      return next === s ? null : next;
    },
    extraEdges: (s) => s.added,
    tick: (s) => {
      const r = wiring.tick(graph, s, p);
      return r.state === s ? null : r;
    },
    colors: (s) => s.orange.map((on): NodeColor => (on ? 'orange' : 'none')),
    // After a full run that fell short, ring the nodes it didn't reach.
    marks: (s) => ({ wrong: s.ticks >= p.ticks && !wiring.isSolved(s) ? s.orange.flatMap((on, v) => (on ? [] : [v])) : [] }),
    message: (s) =>
      s.ticks >= p.ticks && !wiring.isSolved(s)
        ? 'Out of ticks: ringed nodes weren’t reached. Rewire and try again.'
        : `Drag between nodes to link them; tap a new link to remove it. Reach every node in ${p.ticks} tick${p.ticks === 1 ? '' : 's'}.`,
    isFinished: wiring.isSolved,
    stats: [
      { label: 'Links', value: (s) => `${s.added.length}/${p.budget}`, dim: (s) => s.added.length > best, nudgeOnReject: true },
      { label: 'Par', value: () => fmt(best) },
      { label: 'Ticks', value: (s) => `${s.ticks}/${p.ticks}`, nudgeOnReject: true },
    ],
    result: (s) => {
      const n = s.added.length;
      return {
        score: n,
        lowerIsBetter: true,
        stars: wiring.wiringStars(n, best),
        title: n <= best ? 'Optimal' : n === best + 1 ? 'One link over par' : 'Connected',
        detail: `${n} new link${n === 1 ? '' : 's'} · par ${fmt(best)}`,
      };
    },
    setupBoard: (board) => board.mark([p.seed], 'source'),
  });
}

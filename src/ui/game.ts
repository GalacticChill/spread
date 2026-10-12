// Game screens for each mode: plug the pure rules from src/core into the shared shell.

import { canSpread, containmentStars, initialState as containmentInitial, ORANGE, PROTECTED, savedCount, shieldsLeft, tick as containmentTick, toggleProtect, type ContainmentState } from '../core/containment';
import { adjacency } from '../core/graph';
import type { ContainmentLevel, SpreadLevel, ThresholdLevel } from '../core/level';
import { initialState as spreadInitial, isComplete, starsFor, tap, tick as spreadTick, type SpreadState } from '../core/spread';
import { thresholdOf, thresholdTick } from '../core/threshold';
import type { NodeColor } from './board';
import type { ModeInfo } from './modes';
import { gameShell } from './shell';
import { progressFor } from './storage';

export function gameScreen(mode: ModeInfo, index: number) {
  const level = mode.levels[index];
  switch (level.mode) {
    case 'spread':
      return spreadGame(mode, index, level);
    case 'containment':
      return containmentGame(mode, index, level);
    case 'threshold':
      return spreadGame(mode, index, level);
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
      { label: 'Par', value: () => String(level.par) },
      { label: 'Best', value: () => String(progressFor(level.id)?.best ?? '–') },
    ],
    result: (s) => {
      const p = level.par;
      return {
        score: s.moves,
        lowerIsBetter: true,
        stars: starsFor(s.moves, p),
        title: s.moves < p ? 'Better than par!' : s.moves === p ? 'Optimal' : s.moves === p + 1 ? 'One move off par' : 'Solved',
        detail: `${s.moves} moves · par ${p}`,
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
      { label: 'Goal', value: () => String(best) },
      { label: 'Shields', value: (s) => `${shieldsLeft(s)}/${k}`, dim: (s) => shieldsLeft(s) === 0, nudgeOnReject: true },
    ],
    result: (s) => {
      const saved = savedCount(s);
      return {
        score: saved,
        lowerIsBetter: false,
        stars: containmentStars(saved, best),
        title: saved >= best ? 'Optimal' : saved === best - 1 ? 'One node short' : 'Contained',
        detail: `Saved ${saved} of ${n} · best possible ${best}`,
      };
    },
    setupBoard: (board) => board.mark(sources, 'source'),
  });
}

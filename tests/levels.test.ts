import { describe, expect, it } from 'vitest';
import { solveContainment } from '../src/core/containmentSolver';
import {
  validateLevel,
  type ContainmentLevel,
  type Level,
  type OriginLevel,
  type RivalLevel,
  type SpreadLevel,
  type ThresholdLevel,
  type WiringLevel,
} from '../src/core/level';
import { allExplanations, observe } from '../src/core/origin';
import { solveRival } from '../src/core/rivalSolver';
import { solveSpread } from '../src/core/solver';
import { solveThreshold } from '../src/core/thresholdSolver';
import { solveWiring } from '../src/core/wiringSolver';
import containment from '../src/levels/containment.json';
import origin from '../src/levels/origin.json';
import rival from '../src/levels/rival.json';
import spread from '../src/levels/spread.json';
import threshold from '../src/levels/threshold.json';
import wiring from '../src/levels/wiring.json';

// Guards against hand-edited or stale level JSON: re-solve every level.
const cases = <L extends Level>(levels: unknown) => (levels as L[]).map((l) => [l.id, l] as const);

describe('level files', () => {
  it.each(cases<SpreadLevel>(spread))('%s is valid and its par is current', (_, level) => {
    validateLevel(level);
    expect(level.mode).toBe('spread');
    expect(solveSpread(level.graph).par).toBe(level.par);
  });

  it.each(cases<ContainmentLevel>(containment))('%s is valid and its optimum is current', (_, level) => {
    validateLevel(level);
    expect(level.mode).toBe('containment');
    expect(solveContainment(level.graph, level.params.sources, level.params.k).optimum).toBe(level.optimum);
  });

  it.each(cases<ThresholdLevel>(threshold))('%s is valid and its par is current', (_, level) => {
    validateLevel(level);
    expect(level.mode).toBe('threshold');
    expect(solveThreshold(level.graph).par).toBe(level.par);
  });

  it.each(cases<RivalLevel>(rival))('%s is valid and its optimum is current', (_, level) => {
    validateLevel(level);
    expect(level.mode).toBe('rival');
    expect(solveRival(level.graph, level.params.blue, level.params.budget).optimum).toBe(level.optimum);
  });

  it.each(cases<OriginLevel>(origin))('%s is valid, and its sources explain the observation', (_, level) => {
    validateLevel(level);
    expect(level.mode).toBe('origin');
    const { seeds, ticks, hidden, timed, size } = level.params;
    const all = allExplanations(level.graph, observe(level.graph, seeds, ticks, hidden, timed), size);
    expect(all).toContainEqual([...seeds].sort((a, b) => a - b));
    expect(all.length).toBe(level.explanations);
  });

  it.each(cases<WiringLevel>(wiring))('%s is valid and its optimum is current', (_, level) => {
    validateLevel(level);
    expect(level.mode).toBe('wiring');
    expect(solveWiring(level.graph, level.params).optimum).toBe(level.optimum);
  });
});

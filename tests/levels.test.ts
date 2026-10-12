import { describe, expect, it } from 'vitest';
import { solveContainment } from '../src/core/containmentSolver';
import { validateLevel, type ContainmentLevel, type SpreadLevel, type ThresholdLevel } from '../src/core/level';
import { solveSpread } from '../src/core/solver';
import { solveThreshold } from '../src/core/thresholdSolver';
import containment from '../src/levels/containment.json';
import spread from '../src/levels/spread.json';
import threshold from '../src/levels/threshold.json';

// Guards against hand-edited or stale level JSON: re-solve every level.
describe('level files', () => {
  it.each((spread as SpreadLevel[]).map((l) => [l.id, l] as const))('%s is valid and its par is current', (_, level) => {
    validateLevel(level);
    expect(level.mode).toBe('spread');
    expect(solveSpread(level.graph).par).toBe(level.par);
  });

  it.each((containment as ContainmentLevel[]).map((l) => [l.id, l] as const))('%s is valid and its optimum is current', (_, level) => {
    validateLevel(level);
    expect(level.mode).toBe('containment');
    expect(solveContainment(level.graph, level.params.sources, level.params.k).optimum).toBe(level.optimum);
  });

  it.each((threshold as ThresholdLevel[]).map((l) => [l.id, l] as const))('%s is valid and its par is current', (_, level) => {
    validateLevel(level);
    expect(level.mode).toBe('threshold');
    expect(solveThreshold(level.graph).par).toBe(level.par);
  });
});

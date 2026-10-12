import { describe, expect, it } from 'vitest';
import { MODE_IDS } from '../src/core/sandbox';
import { MODES } from '../src/ui/modes';

describe('mode registry', () => {
  it('has all six modes, each with levels, rules and an About entry', () => {
    expect(MODES.map((m) => m.id)).toEqual(MODE_IDS);
    for (const m of MODES) {
      expect(m.levels.length, m.id).toBeGreaterThanOrEqual(8);
      expect(m.rules.length, m.id).toBeGreaterThan(0);
      expect(m.about.problem, m.id).not.toBe('');
      // One plain sentence: ends with a period or question mark, no line breaks.
      expect(m.about.sentence, m.id).toMatch(/^[^\n]+[.?]$/);
    }
  });
});

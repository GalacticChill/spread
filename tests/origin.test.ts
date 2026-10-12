import { describe, expect, it } from 'vitest';
import { grid, path, petersen } from '../src/core/families';
import { allExplanations, initialState, isOver, observe, originStars, submit, toggleSelect, wrongNodes } from '../src/core/origin';

describe('observe', () => {
  it('untimed: which nodes are orange after T ticks', () => {
    const obs = observe(path(7), [3], 1);
    expect(obs.times).toEqual([null, null, 0, 0, 0, null, null]);
  });

  it('timed: times count from the end of the hidden ticks (0 = already orange)', () => {
    // Seed 0 on P6, 4 ticks total, first 1 hidden: distances 0..4 → 0,0,1,2,3, node 5 not reached.
    const obs = observe(path(6), [0], 4, 1, true);
    expect(obs.times).toEqual([0, 0, 1, 2, 3, null]);
  });
});

describe('Origin rules', () => {
  const g = path(7);
  const obs = observe(g, [3], 1); // orange: 2, 3, 4

  it('only orange nodes can be selected, at most s of them, and taps toggle', () => {
    let s = initialState(3);
    expect(toggleSelect(s, 0, obs, 1)).toBe(s); // not orange
    s = toggleSelect(s, 2, obs, 1);
    expect(s.selected).toEqual([2]);
    expect(toggleSelect(s, 3, obs, 1)).toBe(s); // already s selected
    s = toggleSelect(s, 2, obs, 1);
    expect(s.selected).toEqual([]);
  });

  it('a wrong guess costs a guess and shows the nodes it colors incorrectly', () => {
    let s = toggleSelect(initialState(3), 2, obs, 1);
    s = submit(g, s, obs, 1);
    expect(s.solved).toBe(false);
    expect(s.guessesLeft).toBe(2);
    // Seed 2 would color 1, 2, 3; the truth is 2, 3, 4 → node 1 extra, node 4 missing.
    expect(s.wrong).toEqual([1, 4]);
  });

  it('the right answer solves it', () => {
    const s = submit(g, toggleSelect(initialState(3), 3, obs, 1), obs, 1);
    expect(s.solved).toBe(true);
    expect(isOver(s)).toBe(true);
    expect(originStars(s.guessesUsed)).toBe(3);
  });

  it('needs exactly s selected to submit', () => {
    const s = initialState(3);
    expect(submit(g, s, obs, 1)).toBe(s);
  });

  it('running out of guesses ends the game', () => {
    let s = initialState(1);
    s = submit(g, toggleSelect(s, 2, obs, 1), obs, 1);
    expect(isOver(s)).toBe(true);
    expect(s.solved).toBe(false);
  });

  it('accepts ANY seed set that reproduces the pattern, not just the original', () => {
    // From seed 0, 4 ticks colors all of P5. So does seed 1 (or 2, 3, 4).
    const p5 = path(5);
    const o = observe(p5, [0], 4);
    expect(wrongNodes(p5, [1], o)).toEqual([]);
    expect(allExplanations(p5, o, 1)).toEqual([[0], [1], [2], [3], [4]]);
    // With timing the original is the only explanation.
    expect(allExplanations(p5, observe(p5, [0], 4, 0, true), 1)).toEqual([[0]]);
  });
});

describe('allExplanations', () => {
  it('Petersen, one tick: the closed neighborhood pins down its center', () => {
    expect(allExplanations(petersen(), observe(petersen(), [0], 1), 1)).toEqual([[0]]);
  });

  it('grid: two separate diamonds have one explanation; the original is always among them', () => {
    const g = grid(5, 5);
    const obs = observe(g, [6, 18], 1);
    const all = allExplanations(g, obs, 2);
    expect(all).toContainEqual([6, 18]);
    expect(all).toHaveLength(1);
  });
});

describe('stars', () => {
  it('by guesses used', () => {
    expect(originStars(1)).toBe(3);
    expect(originStars(2)).toBe(2);
    expect(originStars(3)).toBe(1);
  });
});

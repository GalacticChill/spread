import { describe, expect, it } from 'vitest';
import { path, star } from '../src/core/families';
import { initialState, isComplete, starsFor, tap, tick } from '../src/core/spread';

describe('Spread rules', () => {
  const g = path(5);

  it('starts with nothing orange and zero moves', () => {
    const s = initialState(g);
    expect(s.orange).toEqual([false, false, false, false, false]);
    expect(s.moves).toBe(0);
  });

  it('tapping an uncolored node colors it for one move', () => {
    const s = tap(initialState(g), 2);
    expect(s.orange).toEqual([false, false, true, false, false]);
    expect(s.moves).toBe(1);
  });

  it('tapping an orange node is a no-op', () => {
    const s = tap(initialState(g), 2);
    expect(tap(s, 2)).toBe(s);
  });

  it('a tick spreads exactly one hop and reports the ripple paths', () => {
    const r = tick(g, tap(initialState(g), 2));
    expect(r.state.orange).toEqual([false, true, true, true, false]);
    expect(r.state.moves).toBe(2);
    expect(r.newlyOrange.sort()).toEqual([1, 3]);
    expect(r.paths).toEqual([
      [2, 1],
      [2, 3],
    ]);
  });

  it('a tick that changes nothing still costs a move', () => {
    const r = tick(g, initialState(g));
    expect(r.newlyOrange).toEqual([]);
    expect(r.state.moves).toBe(1);
  });

  it('taps and ticks interleave; completes when all orange', () => {
    let s = tap(initialState(g), 0);
    s = tick(g, s).state; // 0,1
    s = tap(s, 4); // 0,1,4
    expect(isComplete(s)).toBe(false);
    s = tick(g, s).state; // 0..4
    expect(isComplete(s)).toBe(true);
    expect(s.moves).toBe(4);
  });

  it('does nothing after completion', () => {
    const sg = star(3);
    const done = tick(sg, tap(initialState(sg), 0)).state;
    expect(isComplete(done)).toBe(true);
    expect(tick(sg, done).state).toBe(done);
    expect(tap(done, 1)).toBe(done);
  });

  it('does not mutate the previous state (undo relies on this)', () => {
    const s0 = initialState(g);
    tap(s0, 1);
    tick(g, s0);
    expect(s0.orange.every((o) => !o)).toBe(true);
  });
});

describe('stars', () => {
  it('3 for par, 2 for par+1, 1 otherwise', () => {
    expect(starsFor(4, 4)).toBe(3);
    expect(starsFor(3, 4)).toBe(3);
    expect(starsFor(5, 4)).toBe(2);
    expect(starsFor(6, 4)).toBe(1);
    expect(starsFor(40, 4)).toBe(1);
  });
});

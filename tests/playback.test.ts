import { describe, expect, it } from 'vitest';
import { fitLabel } from '../src/components/playback';

describe('SVG 标签截断', () => {
  it('短标签原样保留，不附带完整值', () => {
    expect(fitLabel('front · 3', 18)).toEqual({ shown: 'front · 3', full: null });
  });

  it('超长标签截断为 max-1 个码点加省略号，完整值交给悬浮提示', () => {
    const long = `front · 1${'0'.repeat(308)}`;
    const r = fitLabel(long, 18);
    expect(Array.from(r.shown)).toHaveLength(18);
    expect(r.shown.endsWith('…')).toBe(true);
    expect(r.full).toBe(long);
  });

  it('按码点截断，不劈开代理对', () => {
    const r = fitLabel('ab😀cdef', 4);
    expect(r.shown).toBe('ab😀…');
    expect(Array.from(r.shown)).toHaveLength(4);
  });

  it('恰好等于上限时不截断', () => {
    expect(fitLabel('abcde', 5)).toEqual({ shown: 'abcde', full: null });
  });
});

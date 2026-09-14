import { describe, expect, it } from 'vitest';
import type { Problem, Strip } from '../src/types';
import {
  solve,
  compareSequences,
  initialState,
  applicableStrips,
  applyStrip,
  type SearchState,
} from '../src/solver';

/** 确定性伪随机数（mulberry32），保证测试可复现 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomProblem(rand: () => number, index: number): Problem {
  const fragCount = 2 + Math.floor(rand() * 3); // 2..4 个碎片
  const fragments = Array.from({ length: fragCount }, (_, i) => `F${i}`);
  const initialAnchored = fragments.filter(() => rand() < 0.4);
  const stripCount = 1 + Math.floor(rand() * 4); // 1..4 条条带
  const channels = ['ch0', 'ch1'].slice(0, Math.floor(rand() * 3)); // 0..2 条通道

  const strips: Strip[] = Array.from({ length: stripCount }, (_, i) => {
    const shuffled = [...fragments].sort(() => rand() - 0.5);
    const take = 1 + Math.floor(rand() * Math.min(fragCount, 2));
    const pick = (arr: string[], p: number) => arr.filter(() => rand() < p);
    return {
      id: `S${index}_${i}`,
      fragments: shuffled.slice(0, take),
      face: rand() < 0.5 ? 'front' : 'back',
      requiresChannels: pick(channels, 0.5),
      closesChannels: pick(channels, 0.4),
      prerequisites: [], // 先留空，下面统一生成
      length: Math.floor(rand() * 6),
      disabled: rand() < 0.15,
    };
  });
  // 随机前置（允许成环：无解情形也应被两种实现一致判定）
  for (const s of strips) {
    for (const t of strips) {
      if (s.id !== t.id && rand() < 0.15) s.prerequisites.push(t.id);
    }
  }
  return { fragments, initialAnchored, strips };
}

/** 朴素全排列枚举：与 solve 完全独立的参照实现 */
function bruteForce(problem: Problem): { sequence: string[]; totalLength: number } | null {
  let best: { sequence: string[]; totalLength: number } | null = null;

  function walk(state: SearchState): void {
    if (state.anchored.size === problem.fragments.length) {
      if (
        !best ||
        state.applied.length < best.sequence.length ||
        (state.applied.length === best.sequence.length &&
          (state.totalLength < best.totalLength ||
            (state.totalLength === best.totalLength &&
              compareSequences(state.applied, best.sequence) < 0)))
      ) {
        best = { sequence: [...state.applied], totalLength: state.totalLength };
      }
      return;
    }
    for (const strip of applicableStrips(problem, state)) {
      walk(applyStrip(state, strip));
    }
  }

  walk(initialState(problem));
  return best;
}

describe('对照朴素枚举的随机化交叉验证', () => {
  const cases = 400;
  it(`solve 与全排列参照在 ${cases} 个随机问题上结论一致`, () => {
    const rand = rng(20260914);
    let solvable = 0;
    let unsolvable = 0;
    for (let i = 0; i < cases; i++) {
      const problem = randomProblem(rand, i);
      const expected = bruteForce(problem);
      const actual = solve(problem);
      if (expected === null) {
        expect(actual.ok, `问题 ${i} 应无解`).toBe(false);
        unsolvable++;
      } else {
        expect(actual.ok, `问题 ${i} 应有解`).toBe(true);
        if (actual.ok) {
          expect(actual.sequence, `问题 ${i} 序列`).toEqual(expected.sequence);
          expect(actual.totalLength, `问题 ${i} 总长度`).toBe(expected.totalLength);
        }
        solvable++;
      }
    }
    // 样本应同时覆盖有解与无解，防止测试退化为单一场景
    expect(solvable).toBeGreaterThan(0);
    expect(unsolvable).toBeGreaterThan(0);
  });
});

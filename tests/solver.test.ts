import { describe, expect, it } from 'vitest';
import type { Problem, Strip } from '../src/types';
import { solve, compareByCodePoints, compareSequences } from '../src/solver';
import {
  add,
  compare as compareDecimals,
  fromNumber,
  fromString,
  toNumber,
  toStringExact,
} from '../src/decimal';
import { validateProblem, parseProblem } from '../src/validate';
import { parseJson, stringifyJson } from '../src/json';
import { SAMPLE_REORDER, SAMPLE_UNSOLVABLE } from '../src/sample';

function strip(
  partial: (Omit<Partial<Strip>, 'length'> & { length?: number }) & { id: string },
): Strip {
  const { length, ...rest } = partial;
  return {
    fragments: [],
    face: 'front',
    requiresChannels: [],
    closesChannels: [],
    prerequisites: [],
    disabled: false,
    ...rest,
    length: fromNumber(length ?? 1),
  };
}

/** 校验测试用的原始 JSON 条带（length 为普通 JSON 数值） */
function rawStrip(partial: Record<string, unknown> & { id: string }): Record<string, unknown> {
  return {
    fragments: ['A'],
    face: 'front',
    requiresChannels: [],
    closesChannels: [],
    prerequisites: [],
    length: 1,
    disabled: false,
    ...partial,
  };
}

/** 内置样例是原始 JSON，先走统一校验路径得到 Problem */
function problemOf(sample: unknown): Problem {
  const r = validateProblem(sample);
  if ('errors' in r) throw new Error(`内置样例结构非法：${JSON.stringify(r.errors)}`);
  return r.problem;
}

describe('换序：短条先贴堵死、换序可完成', () => {
  it('内置样例的最优解避开先贴短条的陷阱', () => {
    const r = solve(problemOf(SAMPLE_REORDER));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 贪心先贴最短的 x-short 会封闭 ch-back 使 y-span 永不可贴；
    // 唯一可行次序是先 w-long 后 y-span
    expect(r.sequence).toEqual(['w-long', 'y-span']);
    expect(r.stripCount).toBe(2);
    expect(r.totalLength).toBe('8');
    // 逐步信息：先锚定 B，再锚定 C
    expect(r.steps[0].newlyAnchored).toEqual(['B']);
    expect(r.steps[1].newlyAnchored).toEqual(['C']);
    expect(r.steps[0].face).toBe('front');
    expect(r.steps[1].face).toBe('back');
  });

  it('禁用 w-long 后同一问题无解（陷阱成为必然）', () => {
    const r = solve(problemOf(SAMPLE_UNSOLVABLE));
    expect(r.ok).toBe(false);
  });

  it('分支限界不会漏掉更晚才发现的更少条带解', () => {
    const p: Problem = {
      fragments: ['A', 'B', 'C', 'D'],
      initialAnchored: ['A'],
      strips: [
        strip({ id: 'a1', fragments: ['A', 'B'], length: 10 }),
        strip({ id: 'a2', fragments: ['B', 'C'], length: 10 }),
        strip({ id: 'a3', fragments: ['C', 'D'], length: 10 }),
        strip({ id: 'b0', fragments: ['A', 'B', 'C'], length: 5 }),
        strip({ id: 'b1', fragments: ['C', 'D'], length: 5 }),
      ],
    };
    const r = solve(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 按编号序先遇到 3 条带的 a 路径（总长 30），最优是 2 条带的 b 路径
    expect(r.stripCount).toBe(2);
    expect(r.sequence).toEqual(['b0', 'b1']);
    expect(r.totalLength).toBe('10');
  });
});

describe('并列解：条带数与总长度相同则取码点字典序最小序列', () => {
  it('两条等长条带取编号较小者', () => {
    const p: Problem = {
      fragments: ['A', 'B'],
      initialAnchored: ['A'],
      strips: [
        strip({ id: 'zz', fragments: ['A', 'B'], length: 2 }),
        strip({ id: 'aa', fragments: ['A', 'B'], length: 2 }),
      ],
    };
    const r = solve(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sequence).toEqual(['aa']);
  });

  it('多步序列逐元素比较，前位优先', () => {
    const p: Problem = {
      fragments: ['A', 'B', 'C'],
      initialAnchored: ['A'],
      strips: [
        strip({ id: 'm2', fragments: ['A', 'B'], length: 1 }),
        strip({ id: 'm1', fragments: ['A', 'B'], length: 1 }),
        strip({ id: 'z1', fragments: ['B', 'C'], length: 1 }),
      ],
    };
    const r = solve(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sequence).toEqual(['m1', 'z1']);
    expect(r.totalLength).toBe('2');
  });

  it('字典序按 Unicode 码点而非 UTF-16 码元', () => {
    // U+FFF0 的码点小于 U+1F600，但其 UTF-16 码元大于 😀 的前导代理
    expect(compareByCodePoints('\uFFF0', '\u{1F600}')).toBeLessThan(0);
    expect('\u{1F600}' < '\uFFF0').toBe(true); // JS 默认按码元比较，结论相反
    expect(compareSequences(['a', 'b'], ['a', 'b', 'c'])).toBeLessThan(0);
    expect(compareSequences(['b'], ['a', 'z'])).toBeGreaterThan(0);
  });

  it('条带数优先于总长度：一条长带胜过两条短带', () => {
    const p: Problem = {
      fragments: ['A', 'B', 'C'],
      initialAnchored: ['A'],
      strips: [
        strip({ id: 'big', fragments: ['A', 'B', 'C'], length: 100 }),
        strip({ id: 's1', fragments: ['A', 'B'], length: 1 }),
        strip({ id: 's2', fragments: ['B', 'C'], length: 1 }),
      ],
    };
    const r = solve(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sequence).toEqual(['big']);
    expect(r.totalLength).toBe('100');
  });
});

describe('无解：失败分支与最早阻断解释', () => {
  it('内置无解样例：按（步数, 序列）排序并解释各候选违反的约束', () => {
    const r = solve(problemOf(SAMPLE_UNSOLVABLE));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // 不返回部分方案
    expect('sequence' in r).toBe(false);
    expect('steps' in r).toBe(false);

    expect(r.deadEnds.length).toBeGreaterThan(0);
    // 排序：步数升序，同步数按码点字典序
    for (let i = 1; i < r.deadEnds.length; i++) {
      const a = r.deadEnds[i - 1];
      const b = r.deadEnds[i];
      expect(a.sequence.length).toBeLessThanOrEqual(b.sequence.length);
      if (a.sequence.length === b.sequence.length) {
        expect(compareSequences(a.sequence, b.sequence)).toBeLessThan(0);
      }
    }
    // 最早阻断：贴上 x-short 后 ch-back 被封
    const first = r.deadEnds[0];
    expect(first.sequence).toEqual(['x-short']);
    expect(first.closedChannels).toContain('ch-back');
    expect(first.anchored).toEqual(['A', 'B']);
    const ySpan = first.candidates.find((c) => c.stripId === 'y-span');
    expect(ySpan?.violations).toContainEqual({ kind: 'channel-closed', channel: 'ch-back' });
    const wLong = first.candidates.find((c) => c.stripId === 'w-long');
    expect(wLong?.violations).toContainEqual({ kind: 'disabled' });
  });

  it('孤片无任何条带连接：最早阻断发生在第 0 步', () => {
    const p: Problem = {
      fragments: ['A', 'B'],
      initialAnchored: ['A'],
      // 唯一条带只连未锚定的 B，第 0 步即无可贴条带
      strips: [strip({ id: 'only', fragments: ['B'] })],
    };
    const r = solve(p);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.deadEnds[0].sequence).toEqual([]);
    const only = r.deadEnds[0].candidates.find((c) => c.stripId === 'only');
    expect(only?.violations).toContainEqual({ kind: 'no-anchored-fragment' });
  });

  it('前置环导致无解，并报告缺失的前置', () => {
    const p: Problem = {
      fragments: ['A', 'B'],
      initialAnchored: ['A'],
      strips: [
        strip({ id: 'p1', fragments: ['A', 'B'], prerequisites: ['p2'] }),
        strip({ id: 'p2', fragments: ['A', 'B'], prerequisites: ['p1'] }),
      ],
    };
    const r = solve(p);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const first = r.deadEnds[0];
    expect(first.sequence).toEqual([]);
    const p1 = first.candidates.find((c) => c.stripId === 'p1');
    expect(p1?.violations).toContainEqual({ kind: 'prerequisite-missing', prerequisite: 'p2' });
  });

  it('未锚定碎片约束：无锚定点的条带不可作为首贴', () => {
    const p: Problem = {
      fragments: ['A', 'B', 'C'],
      initialAnchored: ['A'],
      strips: [strip({ id: 'far', fragments: ['B', 'C'] })],
    };
    const r = solve(p);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const far = r.deadEnds[0].candidates.find((c) => c.stripId === 'far');
    expect(far?.violations).toContainEqual({ kind: 'no-anchored-fragment' });
  });
});

describe('结构校验：错误定位到对象', () => {
  it('合法输入通过', () => {
    const r = validateProblem(SAMPLE_REORDER);
    expect('problem' in r).toBe(true);
  });

  it('重复条带编号定位到 strips[i].id', () => {
    const r = validateProblem({
      fragments: ['A'],
      initialAnchored: [],
      strips: [rawStrip({ id: 'x' }), rawStrip({ id: 'x' })],
    });
    expect('errors' in r).toBe(true);
    if (!('errors' in r)) return;
    expect(r.errors.some((e) => e.path === 'strips[1].id')).toBe(true);
  });

  it('空编号、未知碎片、负长度、非布尔禁用均被定位', () => {
    const r = validateProblem({
      fragments: ['A', ''],
      initialAnchored: ['ZZ'],
      strips: [
        {
          id: 's',
          fragments: ['A', 'NOPE'],
          face: '',
          requiresChannels: ['c', 'c'],
          closesChannels: [],
          prerequisites: ['ghost'],
          length: -3,
          disabled: 'yes',
        },
      ],
    });
    expect('errors' in r).toBe(true);
    if (!('errors' in r)) return;
    const paths = r.errors.map((e) => e.path);
    expect(paths).toContain('fragments[1]');
    expect(paths).toContain('initialAnchored[0]');
    expect(paths).toContain('strips[0].fragments[1]');
    expect(paths).toContain('strips[0].face');
    expect(paths).toContain('strips[0].requiresChannels[1]');
    expect(paths).toContain('strips[0].prerequisites[0]');
    expect(paths).toContain('strips[0].length');
    expect(paths).toContain('strips[0].disabled');
  });

  it('条带不能以自身为前置', () => {
    const r = validateProblem({
      fragments: ['A'],
      initialAnchored: ['A'],
      strips: [{ ...rawStrip({ id: 's' }), prerequisites: ['s'] }],
    });
    expect('errors' in r).toBe(true);
    if (!('errors' in r)) return;
    expect(r.errors[0].path).toBe('strips[0].prerequisites[0]');
  });

  it('JSON 解析失败返回 $ 路径错误', () => {
    const r = parseProblem('{ not json');
    expect('errors' in r).toBe(true);
    if (!('errors' in r)) return;
    expect(r.errors[0].path).toBe('$');
    expect(r.errors[0].message).toContain('JSON 解析失败');
  });

  it('根节点必须是对象', () => {
    const r = parseProblem('[1,2,3]');
    expect('errors' in r).toBe(true);
    if (!('errors' in r)) return;
    expect(r.errors[0].path).toBe('$');
  });
});

describe('求解器一般性质', () => {
  it('全部碎片初始已锚定：零条带即完成', () => {
    const p: Problem = {
      fragments: ['A'],
      initialAnchored: ['A'],
      strips: [strip({ id: 'unused', fragments: ['A'], length: 5 })],
    };
    const r = solve(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sequence).toEqual([]);
    expect(r.stripCount).toBe(0);
    expect(r.totalLength).toBe('0');
  });

  it('零长度条带合法且参与最优', () => {
    const p: Problem = {
      fragments: ['A', 'B'],
      initialAnchored: ['A'],
      strips: [strip({ id: 'free', fragments: ['A', 'B'], length: 0 })],
    };
    const r = solve(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sequence).toEqual(['free']);
    expect(r.totalLength).toBe('0');
  });

  it('前置约束被遵守：前置条带先施工', () => {
    const p: Problem = {
      fragments: ['A', 'B', 'C'],
      initialAnchored: ['A'],
      strips: [
        strip({ id: 'top', fragments: ['B', 'C'], prerequisites: ['base'] }),
        strip({ id: 'base', fragments: ['A', 'B'] }),
      ],
    };
    const r = solve(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sequence).toEqual(['base', 'top']);
  });

  it('已贴条带封闭的通道不影响后续无需该通道的条带', () => {
    const p: Problem = {
      fragments: ['A', 'B', 'C'],
      initialAnchored: ['A'],
      strips: [
        strip({ id: 'first', fragments: ['A', 'B'], closesChannels: ['ch'] }),
        strip({ id: 'second', fragments: ['B', 'C'] }),
      ],
    };
    const r = solve(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sequence).toEqual(['first', 'second']);
  });
});

describe('回归：含控制字符的合法编号不误报无解', () => {
  it('状态键编码无碰撞，唯一可行分支不被记忆化吞掉', () => {
    // 集合 {"a","x\u0001b"} 与 {"a\u0001x","b"} 在朴素拼接键下相同；
    // 前者是死路（封闭 d-fix 所需通道），后者是唯一通向目标的路径
    const p: Problem = {
      fragments: ['A', 'B', 'C', 'D'],
      initialAnchored: ['A'],
      strips: [
        strip({ id: 'a', fragments: ['A', 'B'], closesChannels: ['ch2'] }),
        strip({ id: 'x\u0001b', fragments: ['B', 'C'], closesChannels: ['ch'] }),
        strip({ id: 'a\u0001x', fragments: ['A', 'B'] }),
        strip({ id: 'b', fragments: ['B', 'C'] }),
        strip({ id: 'd-fix', fragments: ['C', 'D'], requiresChannels: ['ch', 'ch2'] }),
      ],
    };
    const r = solve(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sequence).toEqual(['a\u0001x', 'b', 'd-fix']);
    expect(r.stripCount).toBe(3);
  });
});

describe('回归：无解报告保留到达同一状态的全部施工顺序', () => {
  it('两条顺序不同的分支走到同一死状态，两条都列出', () => {
    const p: Problem = {
      fragments: ['A', 'B', 'C'],
      initialAnchored: ['A'],
      strips: [
        strip({ id: 's1', fragments: ['A', 'B'], closesChannels: ['ch'] }),
        strip({ id: 's2', fragments: ['A', 'B'], closesChannels: ['ch'] }),
        strip({ id: 't', fragments: ['B', 'C'], requiresChannels: ['ch'] }),
      ],
    };
    const r = solve(p);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const sequences = r.deadEnds.map((d) => d.sequence);
    expect(sequences).toContainEqual(['s1', 's2']);
    expect(sequences).toContainEqual(['s2', 's1']);
    expect(r.deadEnds).toHaveLength(2);
    // 同一状态的两条分支共享同一组候选违反解释
    expect(r.deadEnds[0].candidates).toEqual(r.deadEnds[1].candidates);
    const t = r.deadEnds[0].candidates.find((c) => c.stripId === 't');
    expect(t?.violations).toContainEqual({ kind: 'channel-closed', channel: 'ch' });
  });
});

describe('回归：小数长度精确比较', () => {
  it('0.1+0.2 与 0.3+0 精确相等，并列最优取码点字典序最小者', () => {
    const p: Problem = {
      fragments: ['A', 'M', 'T'],
      initialAnchored: ['A'],
      strips: [
        strip({ id: 'p1', fragments: ['A', 'M'], length: 0.1, closesChannels: ['ch2'] }),
        strip({ id: 'p2', fragments: ['M', 'T'], length: 0.2, requiresChannels: ['ch1'] }),
        strip({ id: 'q1', fragments: ['A', 'M'], length: 0.3, closesChannels: ['ch1'] }),
        strip({ id: 'q2', fragments: ['M', 'T'], length: 0, requiresChannels: ['ch2'] }),
      ],
    };
    const r = solve(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 浮点下 0.1+0.2 > 0.3 会错选 q 路径；精确十进制下两者相等，p 路径字典序更小
    expect(r.sequence).toEqual(['p1', 'p2']);
    expect(r.totalLength).toBe('0.3');
  });

  it('十进制运算单元行为', () => {
    const sum = add(fromNumber(0.1), fromNumber(0.2));
    expect(compareDecimals(sum, fromNumber(0.3))).toBe(0);
    expect(toNumber(sum)).toBe(0.3);
    expect(toStringExact(sum)).toBe('0.3');
    expect(compareDecimals(add(fromNumber(1e-7), fromNumber(1e-7)), fromNumber(2e-7))).toBe(0);
    expect(compareDecimals(fromNumber(1e21), fromNumber(0.5))).toBeGreaterThan(0);
    expect(toStringExact(fromNumber(1.5e3))).toBe('1500');
    expect(toStringExact(add(fromNumber(0), fromNumber(0)))).toBe('0');
  });
});

describe('回归：非常接近的小数长度不被当成相同', () => {
  it('JSON 字面量逐位保留，实际更短的条带胜出', () => {
    // 两个长度相差 1e-17，作为 double 都会舍入到 1；
    // 若解析阶段丢精度，两者被判等长，字典序更小的 a-long 会被错选
    const text = `{
      "fragments": ["A", "B"],
      "initialAnchored": ["A"],
      "strips": [
        { "id": "a-long", "fragments": ["A", "B"], "face": "front",
          "requiresChannels": [], "closesChannels": [], "prerequisites": [],
          "length": 1.00000000000000002, "disabled": false },
        { "id": "b-short", "fragments": ["A", "B"], "face": "front",
          "requiresChannels": [], "closesChannels": [], "prerequisites": [],
          "length": 1.00000000000000001, "disabled": false }
      ]
    }`;
    const parsed = parseProblem(text);
    expect('problem' in parsed).toBe(true);
    if (!('problem' in parsed)) return;
    const r = solve(parsed.problem);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sequence).toEqual(['b-short']);
    expect(r.totalLength).toBe('1.00000000000000001');
  });

  it('格式化（解析+序列化往返）不损失字面量精度', () => {
    const parsed = parseProblem('{"fragments":["A"],"initialAnchored":["A"],"strips":[]}');
    expect('problem' in parsed).toBe(true);
    // 直接对 JSON 文本做往返
    const text = '{ "x": 1.00000000000000001, "y": [0.30000000000000004, 1e-7] }';
    const roundTripped = stringifyJson(parseJson(text));
    expect(roundTripped).toContain('1.00000000000000001');
    expect(roundTripped).toContain('0.30000000000000004');
    expect(roundTripped).toContain('1e-7');
  });
});

describe('回归：总长度超出 double 范围仍为精确值', () => {
  it('两条 1e308 的总和是精确的 2e308，而非 Infinity', () => {
    const p: Problem = {
      fragments: ['A', 'B', 'C'],
      initialAnchored: ['A'],
      strips: [
        strip({ id: 'h1', fragments: ['A', 'B'], length: 1e308 }),
        strip({ id: 'h2', fragments: ['B', 'C'], length: 1e308 }),
      ],
    };
    const r = solve(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.totalLength).toBe('2' + '0'.repeat(308));
    expect(Number.isFinite(Number(r.totalLength))).toBe(false); // 确实超出 double
  });

  it('1e999 字面量是合法有限长度（不经过 double 舍入）', () => {
    const text = `{
      "fragments": ["A", "B"],
      "initialAnchored": ["A"],
      "strips": [
        { "id": "huge", "fragments": ["A", "B"], "face": "front",
          "requiresChannels": [], "closesChannels": [], "prerequisites": [],
          "length": 1e999, "disabled": false }
      ]
    }`;
    const parsed = parseProblem(text);
    expect('problem' in parsed).toBe(true);
    if (!('problem' in parsed)) return;
    const r = solve(parsed.problem);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.totalLength).toBe('1' + '0'.repeat(999));
  });

  it('指数超出可处理范围按结构错误定位，而非静默舍入', () => {
    const text = `{
      "fragments": ["A"],
      "initialAnchored": ["A"],
      "strips": [
        { "id": "absurd", "fragments": ["A"], "face": "front",
          "requiresChannels": [], "closesChannels": [], "prerequisites": [],
          "length": 1e2000000, "disabled": false }
      ]
    }`;
    const parsed = parseProblem(text);
    expect('errors' in parsed).toBe(true);
    if (!('errors' in parsed)) return;
    expect(parsed.errors.some((e) => e.path === 'strips[0].length')).toBe(true);
  });

  it('fromString 与 fromNumber 的边界行为', () => {
    expect(toStringExact(fromString('1e999'))).toBe('1' + '0'.repeat(999));
    expect(toStringExact(fromString('-0'))).toBe('0');
    expect(compareDecimals(fromString('1.00000000000000001'), fromString('1.00000000000000002')))
      .toBeLessThan(0);
    expect(() => fromString('1e2000000')).toThrow();
    expect(() => fromString('abc')).toThrow();
    expect(toNumber(fromString('0.3'))).toBe(0.3);
  });
});

import { ZERO, add, compare as compareDecimals, fromNumber, toNumber, type Decimal } from './decimal';
import type { DeadEnd, Problem, SolveResult, SolutionStep, Strip, Violation } from './types';

/** 按 Unicode 码点（而非 UTF-16 码元）比较两个字符串 */
export function compareByCodePoints(a: string, b: string): number {
  const ai = Array.from(a);
  const bi = Array.from(b);
  const n = Math.min(ai.length, bi.length);
  for (let i = 0; i < n; i++) {
    const d = ai[i].codePointAt(0)! - bi[i].codePointAt(0)!;
    if (d !== 0) return d;
  }
  return ai.length - bi.length;
}

/** 按码点字典序比较两个编号序列 */
export function compareSequences(a: readonly string[], b: readonly string[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = compareByCodePoints(a[i], b[i]);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

/** 搜索状态。anchored/closedChannels 均可由 appliedSet 确定性推出，冗余保存以便读取 */
export interface SearchState {
  anchored: ReadonlySet<string>;
  closedChannels: ReadonlySet<string>;
  applied: readonly string[];
  appliedSet: ReadonlySet<string>;
  /** 精确十进制累计长度，避免浮点误差扭曲并列最优比较 */
  totalLength: Decimal;
}

export function initialState(problem: Problem): SearchState {
  return {
    anchored: new Set(problem.initialAnchored),
    closedChannels: new Set(),
    applied: [],
    appliedSet: new Set(),
    totalLength: ZERO,
  };
}

/** 列出条带在当前状态下违反的全部约束；空数组表示可施工 */
export function stripViolations(state: SearchState, strip: Strip): Violation[] {
  const violations: Violation[] = [];
  if (strip.disabled) {
    violations.push({ kind: 'disabled' });
  }
  if (!strip.fragments.some((f) => state.anchored.has(f))) {
    violations.push({ kind: 'no-anchored-fragment' });
  }
  for (const ch of strip.requiresChannels) {
    if (state.closedChannels.has(ch)) {
      violations.push({ kind: 'channel-closed', channel: ch });
    }
  }
  for (const pre of strip.prerequisites) {
    if (!state.appliedSet.has(pre)) {
      violations.push({ kind: 'prerequisite-missing', prerequisite: pre });
    }
  }
  return violations;
}

/** 当前状态下所有可施工的条带（未贴过、未禁用、有锚定点、所需通道开放、前置已贴） */
export function applicableStrips(problem: Problem, state: SearchState): Strip[] {
  return problem.strips.filter(
    (s) => !state.appliedSet.has(s.id) && stripViolations(state, s).length === 0,
  );
}

export function applyStrip(state: SearchState, strip: Strip): SearchState {
  const anchored = new Set(state.anchored);
  for (const f of strip.fragments) anchored.add(f);
  const closedChannels = new Set(state.closedChannels);
  for (const c of strip.closesChannels) closedChannels.add(c);
  const appliedSet = new Set(state.appliedSet);
  appliedSet.add(strip.id);
  return {
    anchored,
    closedChannels,
    applied: [...state.applied, strip.id],
    appliedSet,
    totalLength: add(state.totalLength, fromNumber(strip.length)),
  };
}

/**
 * 已贴集合的记忆化键。编号是任意非空字符串（可含分隔符、引号等），
 * 简单拼接会发生集合碰撞（如 {"a","x b"} 与 {"a x","b"}），
 * 导致剪枝吞掉唯一可行分支、误报无解；JSON 编码对字符串数组是单射，无碰撞。
 */
function setKey(ids: ReadonlySet<string>): string {
  return JSON.stringify([...ids].sort(compareByCodePoints));
}

/**
 * 穷尽搜索最优施工序列。
 * 目标：锚定全部碎片；依次最小化 条带数 → 总长度（精确十进制）→ 编号序列的 Unicode 码点字典序。
 * 不逐条贪心、不硬编码：DFS 全枚举 + 分支限界 + 状态记忆化。
 *
 * 正确性要点：
 * - 条带数与总长度只取决于已贴“集合”，因此限界条件对同集合的任意序列一致；
 * - 记忆化记录“子树内不存在严格优于当前 best 的解”的集合——best 只会变得更优，
 *   故该结论对未来所有 best 依然成立；
 * - 无解时进入第二阶段：不做状态记忆化，逐条枚举每条失败分支，
 *   到达同一死状态的不同施工顺序都作为独立分支报告。
 */
export function solve(problem: Problem): SolveResult {
  const totalFragments = problem.fragments.length;
  const byId = new Map(problem.strips.map((s) => [s.id, s]));

  let best: { sequence: string[]; totalLength: Decimal } | null = null;

  // 子树内不存在优于（访问时刻）best 的解的已贴集合
  const useless = new Set<string>();

  /** 当前部分序列是否已在码点字典序上严格大于 best 的同长前缀（若是则任何补全都更差） */
  function prefixDominated(seq: readonly string[]): boolean {
    if (!best) return false;
    const n = Math.min(seq.length, best.sequence.length);
    for (let i = 0; i < n; i++) {
      const d = compareByCodePoints(seq[i], best.sequence[i]);
      if (d !== 0) return d > 0;
    }
    return false;
  }

  function dfs(state: SearchState): void {
    if (state.anchored.size === totalFragments) {
      if (
        !best ||
        state.applied.length < best.sequence.length ||
        (state.applied.length === best.sequence.length &&
          (compareDecimals(state.totalLength, best.totalLength) < 0 ||
            (compareDecimals(state.totalLength, best.totalLength) === 0 &&
              compareSequences(state.applied, best.sequence) < 0)))
      ) {
        best = { sequence: [...state.applied], totalLength: state.totalLength };
      }
      return;
    }

    const key = setKey(state.appliedSet);
    if (useless.has(key)) return;

    const candidates = applicableStrips(problem, state);
    if (candidates.length === 0) {
      useless.add(key);
      return;
    }

    // 按编号码点升序探索，使字典序更小的解更早成为 best，加强限界
    const ordered = [...candidates].sort((a, b) => compareByCodePoints(a.id, b.id));
    const bestAtEntry = best;

    for (const strip of ordered) {
      const nextCount = state.applied.length + 1;
      const nextLength = add(state.totalLength, fromNumber(strip.length));
      if (best) {
        const b = best;
        if (nextCount > b.sequence.length) continue;
        if (nextCount === b.sequence.length && compareDecimals(nextLength, b.totalLength) > 0) {
          continue;
        }
        if (
          nextCount === b.sequence.length &&
          compareDecimals(nextLength, b.totalLength) === 0 &&
          prefixDominated([...state.applied, strip.id])
        ) {
          continue;
        }
      }
      dfs(applyStrip(state, strip));
    }

    if (best === bestAtEntry) {
      // 子树没有产生优于 bestAtEntry 的解；best 之后只会更优，故本集合永久无用
      useless.add(key);
    }
  }

  dfs(initialState(problem));

  if (best) {
    const b = best as { sequence: string[]; totalLength: Decimal };
    const steps: SolutionStep[] = [];
    let state = initialState(problem);
    for (const id of b.sequence) {
      const strip = byId.get(id)!;
      const newlyAnchored = strip.fragments.filter((f) => !state.anchored.has(f));
      steps.push({
        stripId: id,
        face: strip.face,
        length: strip.length,
        closesChannels: [...strip.closesChannels],
        newlyAnchored,
      });
      state = applyStrip(state, strip);
    }
    return {
      ok: true,
      sequence: b.sequence,
      stripCount: b.sequence.length,
      totalLength: toNumber(b.totalLength),
      steps,
    };
  }

  // 无解：第二阶段完整枚举每条失败分支（不做状态记忆化）。
  // 每条分支取其首个无可贴条带的状态——分支无法越过该状态继续，即其终结状态；
  // 到达同一状态的不同施工顺序都是独立分支，全部保留，不返回任何部分方案。
  const deadEnds: { sequence: string[]; state: SearchState }[] = [];

  function dfsAllBranches(state: SearchState): void {
    if (state.anchored.size === totalFragments) return; // 无解前提下不可达，防御性保留
    const candidates = applicableStrips(problem, state);
    if (candidates.length === 0) {
      deadEnds.push({ sequence: [...state.applied], state });
      return;
    }
    for (const strip of candidates) {
      dfsAllBranches(applyStrip(state, strip));
    }
  }

  dfsAllBranches(initialState(problem));

  const sorted = deadEnds
    .map(({ sequence, state }) => {
      const candidates = problem.strips
        .filter((s) => !state.appliedSet.has(s.id))
        .map((s) => ({ stripId: s.id, violations: stripViolations(state, s) }));
      return {
        sequence,
        anchored: problem.fragments.filter((f) => state.anchored.has(f)),
        closedChannels: [...state.closedChannels].sort(compareByCodePoints),
        candidates,
      } satisfies DeadEnd;
    })
    .sort(
      (a, b) => a.sequence.length - b.sequence.length || compareSequences(a.sequence, b.sequence),
    );

  return { ok: false, deadEnds: sorted };
}

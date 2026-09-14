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
  totalLength: number;
}

export function initialState(problem: Problem): SearchState {
  return {
    anchored: new Set(problem.initialAnchored),
    closedChannels: new Set(),
    applied: [],
    appliedSet: new Set(),
    totalLength: 0,
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
    totalLength: state.totalLength + strip.length,
  };
}

function setKey(ids: ReadonlySet<string>): string {
  return [...ids].sort(compareByCodePoints).join('\u0001');
}

/**
 * 穷尽搜索最优施工序列。
 * 目标：锚定全部碎片；依次最小化 条带数 → 总长度 → 编号序列的 Unicode 码点字典序。
 * 不逐条贪心、不硬编码：DFS 全枚举 + 分支限界 + 状态记忆化。
 *
 * 正确性要点：
 * - 条带数与总长度只取决于已贴“集合”，因此限界条件对同集合的任意序列一致；
 * - 记忆化记录“子树内不存在严格优于当前 best 的解”的集合——best 只会变得更优，
 *   故该结论对未来所有 best 依然成立；
 * - 无解时 best 始终为空、限界不生效，所有失败分支被完整枚举。
 */
export function solve(problem: Problem): SolveResult {
  const totalFragments = problem.fragments.length;
  const byId = new Map(problem.strips.map((s) => [s.id, s]));

  let best: { sequence: string[]; totalLength: number } | null = null;

  // 子树内不存在优于（访问时刻）best 的解的已贴集合
  const useless = new Set<string>();
  // 无解时收集：已贴集合 key -> 到达它的码点字典序最小序列及其状态
  const deadEnds = new Map<string, { sequence: string[]; state: SearchState }>();

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
          (state.totalLength < best.totalLength ||
            (state.totalLength === best.totalLength &&
              compareSequences(state.applied, best.sequence) < 0)))
      ) {
        best = { sequence: [...state.applied], totalLength: state.totalLength };
      }
      return;
    }

    const key = setKey(state.appliedSet);

    // 已知死状态：若是无解搜索中的死端，保留到达它的码点最小序列
    const recorded = deadEnds.get(key);
    if (recorded) {
      if (compareSequences(state.applied, recorded.sequence) < 0) {
        deadEnds.set(key, { sequence: [...state.applied], state });
      }
      return;
    }
    if (useless.has(key)) return;

    const candidates = applicableStrips(problem, state);
    if (candidates.length === 0) {
      useless.add(key);
      deadEnds.set(key, { sequence: [...state.applied], state });
      return;
    }

    // 按编号码点升序探索，使字典序更小的解更早成为 best，加强限界
    const ordered = [...candidates].sort((a, b) => compareByCodePoints(a.id, b.id));
    const bestAtEntry = best;

    for (const strip of ordered) {
      const nextCount = state.applied.length + 1;
      const nextLength = state.totalLength + strip.length;
      if (best) {
        const b = best;
        if (nextCount > b.sequence.length) continue;
        if (nextCount === b.sequence.length && nextLength > b.totalLength) continue;
        if (
          nextCount === b.sequence.length &&
          nextLength === b.totalLength &&
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
    const b = best as { sequence: string[]; totalLength: number };
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
      totalLength: b.totalLength,
      steps,
    };
  }

  // 无解：每条失败分支取首个无可贴条带的状态（按已贴集合去重、序列取码点最小），
  // 再按（施工步数, 已贴编号序列）升序排列，首项即最早阻断；不返回任何部分方案。
  const sorted = [...deadEnds.values()]
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

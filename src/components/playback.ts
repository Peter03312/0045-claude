import type { Problem, Strip } from '../types';
import { applicableStrips, applyStrip, initialState, type SearchState } from '../solver';

export interface PlaybackFrame {
  /** 已施工序列前缀 */
  applied: string[];
  anchored: ReadonlySet<string>;
  closedChannels: ReadonlySet<string>;
  /** 当前可施工条带编号 */
  applicableIds: string[];
  /** 本帧刚施工的条带（第 0 帧为 null） */
  justApplied: string | null;
}

/** 由解序列生成逐步播放帧（第 0 帧为初始状态） */
export function buildFrames(problem: Problem, sequence: string[]): PlaybackFrame[] {
  const byId = new Map(problem.strips.map((s) => [s.id, s]));
  const frames: PlaybackFrame[] = [];
  let state: SearchState = initialState(problem);
  frames.push(toFrame(problem, state, null));
  for (const id of sequence) {
    const strip = byId.get(id);
    if (!strip) break;
    state = applyStrip(state, strip);
    frames.push(toFrame(problem, state, id));
  }
  return frames;
}

function toFrame(problem: Problem, state: SearchState, justApplied: string | null): PlaybackFrame {
  return {
    applied: [...state.applied],
    anchored: state.anchored,
    closedChannels: state.closedChannels,
    applicableIds: applicableStrips(problem, state).map((s) => s.id),
    justApplied,
  };
}

/** 问题中引用到的全部通道（初始均开放），按码点序排列 */
export function allChannels(problem: Problem): string[] {
  const set = new Set<string>();
  for (const s of problem.strips) {
    for (const c of s.requiresChannels) set.add(c);
    for (const c of s.closesChannels) set.add(c);
  }
  return [...set].sort();
}

export interface GraphLayout {
  fragments: Record<string, { x: number; y: number }>;
  strips: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
}

/**
 * 确定性拓扑布局：碎片节点均匀放在圆周上（初始锚定者从顶部开始），
 * 条带节点放在其所连碎片质心略外移处，避免与碎片重叠。
 */
export function layoutGraph(problem: Problem): GraphLayout {
  const width = 640;
  const height = 420;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 70;

  const order = [...problem.fragments].sort((a, b) => {
    const aa = problem.initialAnchored.includes(a) ? 0 : 1;
    const ab = problem.initialAnchored.includes(b) ? 0 : 1;
    return aa - ab || a.localeCompare(b);
  });

  const fragments: GraphLayout['fragments'] = {};
  order.forEach((f, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(order.length, 1);
    fragments[f] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  const strips: GraphLayout['strips'] = {};
  // 连接相同碎片集合的条带会落在同一质心，按组内序号环绕散开避免重叠；
  // 碎片名可含任意字符，分组键用 JSON 编码避免拼接碰撞
  const groups = new Map<string, Strip[]>();
  for (const s of problem.strips) {
    const key = JSON.stringify([...s.fragments].sort());
    const g = groups.get(key) ?? [];
    g.push(s);
    groups.set(key, g);
  }
  for (const group of groups.values()) {
    group.forEach((s, idx) => {
      const pts = s.fragments.map((f) => fragments[f]).filter(Boolean);
      let bx = cx;
      let by = cy;
      if (pts.length > 0) {
        const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
        const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
        // 单碎片条带：沿径向外移；多碎片：质心向内收一点，避免压住碎片节点
        if (pts.length === 1) {
          const dx = mx - cx;
          const dy = my - cy;
          const len = Math.hypot(dx, dy) || 1;
          bx = mx + (dx / len) * 46;
          by = my + (dy / len) * 46;
        } else {
          bx = cx + (mx - cx) * 0.72;
          by = cy + (my - cy) * 0.72;
        }
      }
      if (group.length > 1) {
        const angle = (2 * Math.PI * idx) / group.length;
        bx += 44 * Math.cos(angle);
        by += 30 * Math.sin(angle);
      }
      strips[s.id] = { x: bx, y: by };
    });
  }

  return { fragments, strips, width, height };
}

export function stripById(problem: Problem, id: string): Strip | undefined {
  return problem.strips.find((s) => s.id === id);
}

/**
 * SVG 文本不可折行：超长标签按码点截断并追加省略号，
 * 完整值通过返回值 full 交给 <title> 悬浮提示，不丢信息。
 */
export function fitLabel(text: string, max: number): { shown: string; full: string | null } {
  const chars = Array.from(text);
  if (chars.length <= max) return { shown: text, full: null };
  return { shown: chars.slice(0, max - 1).join('') + '…', full: text };
}

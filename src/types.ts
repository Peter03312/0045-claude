/**
 * 领域模型：碎片修补次序问题。
 * 所有标识均为唯一非空字符串；通道只需被条带引用即存在，初始全部开放。
 */

export interface Strip {
  /** 条带编号，全局唯一非空 */
  id: string;
  /** 所连碎片编号列表（非空，引用必须存在） */
  fragments: string[];
  /** 施工面（非空字符串，如 "front" / "back"） */
  face: string;
  /** 施工所需通道：贴条时必须全部开放 */
  requiresChannels: string[];
  /** 贴后封闭通道 */
  closesChannels: string[];
  /** 叠压前置：所列条带必须先于本条带施工 */
  prerequisites: string[];
  /** 非负长度 */
  length: number;
  /** 禁用状态：禁用条带任何时刻都不可施工 */
  disabled: boolean;
}

export interface Problem {
  /** 全部碎片编号 */
  fragments: string[];
  /** 初始锚定的碎片子集 */
  initialAnchored: string[];
  /** 候选条带 */
  strips: Strip[];
}

/** 结构错误：path 定位到出错对象（如 strips[2].fragments[0]） */
export interface ValidationError {
  path: string;
  message: string;
}

/** 单条候选条带在某状态下违反的约束 */
export type Violation =
  | { kind: 'disabled' }
  | { kind: 'no-anchored-fragment' }
  | { kind: 'channel-closed'; channel: string }
  | { kind: 'prerequisite-missing'; prerequisite: string };

/** 无解时某失败分支的终结状态（首个无可贴条带的状态） */
export interface DeadEnd {
  /** 到达该状态已贴的条带编号序列（同一已贴集合取码点字典序最小者） */
  sequence: string[];
  /** 该状态下的锚定碎片 */
  anchored: string[];
  /** 该状态下已封闭的通道 */
  closedChannels: string[];
  /** 每条未施工条带（含禁用）违反的约束列表 */
  candidates: { stripId: string; violations: Violation[] }[];
}

export interface SolutionStep {
  stripId: string;
  face: string;
  length: number;
  closesChannels: string[];
  /** 本步新锚定的碎片 */
  newlyAnchored: string[];
}

export type SolveResult =
  | {
      ok: true;
      sequence: string[];
      stripCount: number;
      totalLength: number;
      steps: SolutionStep[];
    }
  | {
      ok: false;
      /** 按（施工步数, 已贴编号序列）升序排列；首项即最早阻断 */
      deadEnds: DeadEnd[];
    };

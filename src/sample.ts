/**
 * 内置样例：原始 JSON 对象（非校验后的 Problem），
 * 载入编辑器后经统一校验路径解析，数值字面量精度完整保留。
 */

/**
 * 样例一「短条先贴堵死、换序可完成」：
 * 碎片 A 初始锚定。短条 x-short 长度最小，但它贴后会封闭背面通道 ch-back，
 * 而条带 y-span 必须经 ch-back 施工才能把孤片 C 固定——若先贴 x-short，
 * ch-back 被封，y-span 永远无法施工，C 成为孤片，分支失败。
 * 唯一可行次序：先贴不封闭通道的 w-long 锚定 B，再贴 y-span 锚定 C。
 */
export const SAMPLE_REORDER: unknown = {
  fragments: ['A', 'B', 'C'],
  initialAnchored: ['A'],
  strips: [
    {
      id: 'x-short',
      fragments: ['A', 'B'],
      face: 'front',
      requiresChannels: [],
      closesChannels: ['ch-back'],
      prerequisites: [],
      length: 1,
      disabled: false,
    },
    {
      id: 'w-long',
      fragments: ['A', 'B'],
      face: 'front',
      requiresChannels: [],
      closesChannels: [],
      prerequisites: [],
      length: 3,
      disabled: false,
    },
    {
      id: 'y-span',
      fragments: ['B', 'C'],
      face: 'back',
      requiresChannels: ['ch-back'],
      closesChannels: [],
      prerequisites: [],
      length: 5,
      disabled: false,
    },
  ],
};

/**
 * 样例二「无解演示」：与样例一相同，但 w-long 被禁用。
 * 此时唯一通向 C 的施工面通道必然被 x-short 提前封死，搜索穷尽无解，
 * 用于展示失败分支的阻断解释。
 */
export const SAMPLE_UNSOLVABLE: unknown = {
  fragments: ['A', 'B', 'C'],
  initialAnchored: ['A'],
  strips: [
    {
      id: 'x-short',
      fragments: ['A', 'B'],
      face: 'front',
      requiresChannels: [],
      closesChannels: ['ch-back'],
      prerequisites: [],
      length: 1,
      disabled: false,
    },
    {
      id: 'w-long',
      fragments: ['A', 'B'],
      face: 'front',
      requiresChannels: [],
      closesChannels: [],
      prerequisites: [],
      length: 3,
      disabled: true,
    },
    {
      id: 'y-span',
      fragments: ['B', 'C'],
      face: 'back',
      requiresChannels: ['ch-back'],
      closesChannels: [],
      prerequisites: [],
      length: 5,
      disabled: false,
    },
  ],
};

export function sampleText(sample: unknown): string {
  return JSON.stringify(sample, null, 2);
}

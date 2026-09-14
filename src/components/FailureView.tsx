import type { DeadEnd, Violation } from '../types';

interface Props {
  deadEnds: DeadEnd[];
}

function violationText(v: Violation): string {
  switch (v.kind) {
    case 'disabled':
      return '条带已禁用';
    case 'no-anchored-fragment':
      return '所连碎片均未锚定';
    case 'channel-closed':
      return `所需通道「${v.channel}」已封闭`;
    case 'prerequisite-missing':
      return `前置条带「${v.prerequisite}」未施工`;
  }
}

/** 无解报告：按（步数, 序列）排序的失败分支；首项为最早阻断并展开约束解释 */
export function FailureView({ deadEnds }: Props) {
  return (
    <section className="failure" data-testid="failure">
      <h2>穷尽搜索无解</h2>
      <p className="summary">
        所有施工分支均无法锚定全部碎片，不返回部分方案。以下按（施工步数, 已贴编号序列）列出每条失败分支
        首个无可贴条带的状态，并解释最早阻断中各候选条带违反的约束。
      </p>
      {deadEnds.map((d, i) => (
        <details key={d.sequence.join('\u0001') || '(empty)'} open={i === 0} className="deadend">
          <summary data-testid={i === 0 ? 'earliest-block' : undefined}>
            {i === 0 ? '【最早阻断】' : `【阻断 ${i + 1}】`}
            已贴 {d.sequence.length} 步：{d.sequence.length > 0 ? d.sequence.join(' → ') : '（未施工）'}
          </summary>
          <div className="deadend-body">
            <p>已锚定碎片：{d.anchored.join('、') || '（无）'}</p>
            <p>已封闭通道：{d.closedChannels.join('、') || '（无）'}</p>
            <table>
              <thead>
                <tr>
                  <th>候选条带</th>
                  <th>违反的约束</th>
                </tr>
              </thead>
              <tbody>
                {d.candidates.map((c) => (
                  <tr key={c.stripId}>
                    <td>
                      <code>{c.stripId}</code>
                    </td>
                    <td>
                      <ul>
                        {c.violations.map((v, j) => (
                          <li key={j}>{violationText(v)}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </section>
  );
}

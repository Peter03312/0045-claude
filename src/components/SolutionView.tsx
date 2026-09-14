import { useEffect, useMemo, useState } from 'react';
import type { Problem, SolveResult } from '../types';
import { allChannels, buildFrames, stripById } from './playback';
import { GraphView } from './GraphView';

interface Props {
  problem: Problem;
  result: Extract<SolveResult, { ok: true }>;
}

/** 求解结果的逐步复演：拓扑图 + 施工步骤 + 通道状态 */
export function SolutionView({ problem, result }: Props) {
  const frames = useMemo(() => buildFrames(problem, result.sequence), [problem, result.sequence]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [result]);

  useEffect(() => {
    if (!playing) return;
    if (step >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => Math.min(s + 1, frames.length - 1)), 900);
    return () => clearTimeout(t);
  }, [playing, step, frames.length]);

  const frame = frames[step];
  const channels = allChannels(problem);
  const justStrip = frame.justApplied ? stripById(problem, frame.justApplied) : null;

  return (
    <section className="solution" data-testid="solution">
      <h2>最优施工次序</h2>
      <p className="summary" data-testid="solution-summary">
        条带数 <strong>{result.stripCount}</strong> · 总长度 <strong>{result.totalLength}</strong>{' '}
        · 序列 <code data-testid="solution-sequence">{result.sequence.join(' → ')}</code>
      </p>

      <div className="playback-controls">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          data-testid="step-prev"
        >
          ◀ 上一步
        </button>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          data-testid="step-play"
        >
          {playing ? '暂停' : '播放'}
        </button>
        <button
          type="button"
          onClick={() => setStep((s) => Math.min(frames.length - 1, s + 1))}
          disabled={step === frames.length - 1}
          data-testid="step-next"
        >
          下一步 ▶
        </button>
        <span className="step-indicator" data-testid="step-indicator">
          第 {step} / {frames.length - 1} 步
        </span>
      </div>

      <GraphView problem={problem} frame={frame} />

      <div className="panels">
        <div className="panel">
          <h3>本步状态</h3>
          {justStrip ? (
            <p data-testid="step-action">
              施工 <strong>{justStrip.id}</strong>（面 {justStrip.face}，长度 {justStrip.length}
              {justStrip.closesChannels.length > 0
                ? `，封闭通道 ${justStrip.closesChannels.join('、')}`
                : ''}
              ）
            </p>
          ) : (
            <p data-testid="step-action">初始状态：尚未施工。</p>
          )}
          <p>
            已锚定：
            <span data-testid="anchored-list">
              {problem.fragments.filter((f) => frame.anchored.has(f)).join('、') || '（无）'}
            </span>
          </p>
          <p>
            可贴条带：
            <span data-testid="applicable-list">
              {frame.applicableIds.join('、') || '（无）'}
            </span>
          </p>
        </div>
        <div className="panel">
          <h3>通道</h3>
          {channels.length === 0 ? (
            <p>（本题未引用通道）</p>
          ) : (
            <ul className="channel-list" data-testid="channel-list">
              {channels.map((c) => (
                <li key={c} className={frame.closedChannels.has(c) ? 'closed' : 'open'}>
                  {c}：{frame.closedChannels.has(c) ? '已封闭' : '开放'}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          <h3>施工步骤</h3>
          <ol className="step-list" data-testid="step-list">
            {result.steps.map((s, i) => (
              <li key={s.stripId}>
                <button
                  type="button"
                  className={i + 1 === step ? 'current' : ''}
                  onClick={() => setStep(i + 1)}
                >
                  {i + 1}. {s.stripId}（面 {s.face}，长 {s.length}
                  {s.newlyAnchored.length > 0 ? `，新锚定 ${s.newlyAnchored.join('、')}` : ''}）
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

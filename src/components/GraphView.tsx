import { useMemo } from 'react';
import type { Problem } from '../types';
import { toStringExact } from '../decimal';
import { layoutGraph, stripById, type PlaybackFrame } from './playback';

interface Props {
  problem: Problem;
  frame: PlaybackFrame;
}

/** 拓扑图：圆形=碎片，圆角矩形=条带；按当前播放帧着色 */
export function GraphView({ problem, frame }: Props) {
  const layout = useMemo(() => layoutGraph(problem), [problem]);

  const stripState = (id: string): 'applied' | 'applicable' | 'blocked' | 'disabled' => {
    const strip = stripById(problem, id)!;
    if (frame.applied.includes(id)) return 'applied';
    if (strip.disabled) return 'disabled';
    if (frame.applicableIds.includes(id)) return 'applicable';
    return 'blocked';
  };

  return (
    <svg
      className="graph"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label="碎片条带拓扑图"
      data-testid="graph"
    >
      {/* 条带-碎片连线 */}
      {problem.strips.map((s) =>
        s.fragments.map((f) => {
          const a = layout.strips[s.id];
          const b = layout.fragments[f];
          if (!a || !b) return null;
          return (
            <line
              key={`${s.id}|${f}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={`edge edge-${stripState(s.id)}`}
            />
          );
        }),
      )}

      {/* 条带节点 */}
      {problem.strips.map((s) => {
        const p = layout.strips[s.id];
        if (!p) return null;
        const st = stripState(s.id);
        const just = frame.justApplied === s.id;
        return (
          <g key={s.id} className={`strip strip-${st} ${just ? 'strip-just' : ''}`}>
            <rect
              x={p.x - 46}
              y={p.y - 16}
              width={92}
              height={32}
              rx={8}
              data-testid={`strip-node-${s.id}`}
              data-state={st}
            />
            <text x={p.x} y={p.y - 2} textAnchor="middle" className="strip-label">
              {s.id}
            </text>
            <text x={p.x} y={p.y + 11} textAnchor="middle" className="strip-sub">
              {s.face} · {toStringExact(s.length)}
            </text>
          </g>
        );
      })}

      {/* 碎片节点 */}
      {problem.fragments.map((f) => {
        const p = layout.fragments[f];
        if (!p) return null;
        const anchored = frame.anchored.has(f);
        return (
          <g key={f} className={`fragment ${anchored ? 'fragment-anchored' : ''}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={22}
              data-testid={`fragment-node-${f}`}
              data-anchored={anchored}
            />
            <text x={p.x} y={p.y + 5} textAnchor="middle" className="fragment-label">
              {f}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

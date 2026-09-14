import { useMemo, useRef, useState } from 'react';
import type { SolveResult } from './types';
import { parseProblem } from './validate';
import { solve } from './solver';
import { SAMPLE_REORDER, SAMPLE_UNSOLVABLE, sampleText } from './sample';
import { SolutionView } from './components/SolutionView';
import { FailureView } from './components/FailureView';

export default function App() {
  const [text, setText] = useState(() => sampleText(SAMPLE_REORDER));
  const [result, setResult] = useState<SolveResult | null>(null);
  const [solveError, setSolveError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 实时结构校验：错误随编辑即时定位；任何修改都会使旧解失效（下方 effect 逻辑内联于 onChange）
  const validation = useMemo(() => parseProblem(text), [text]);

  const handleTextChange = (value: string) => {
    setText(value);
    // 修改后旧结果立即失效
    setResult(null);
    setSolveError(null);
  };

  const handleImport = (file: File) => {
    file.text().then((content) => handleTextChange(content));
  };

  const handleSolve = () => {
    if ('errors' in validation) {
      // 结构错误：清除旧解，不启动搜索
      setResult(null);
      setSolveError('存在结构错误，请先修正后再求解。');
      return;
    }
    setSolveError(null);
    setResult(solve(validation.problem));
  };

  const handleFormat = () => {
    try {
      setText(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      // 无法解析时不改动文本，错误列表已提示
    }
  };

  const errors = 'errors' in validation ? validation.errors : null;
  const problem = 'problem' in validation ? validation.problem : null;

  return (
    <div className="app">
      <header>
        <h1>补强条带施工次序台</h1>
        <p className="tagline">
          穷尽搜索：锚定全部碎片，依次最小化条带数、总长度、编号码点字典序
        </p>
      </header>

      <main>
        <section className="editor">
          <div className="editor-toolbar">
            <button type="button" onClick={() => handleTextChange(sampleText(SAMPLE_REORDER))}>
              载入样例：换序可完成
            </button>
            <button type="button" onClick={() => handleTextChange(sampleText(SAMPLE_UNSOLVABLE))}>
              载入样例：无解
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} data-testid="import-button">
              导入 JSON…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              data-testid="import-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = '';
              }}
            />
            <button type="button" onClick={handleFormat}>
              格式化
            </button>
            <button
              type="button"
              className="primary"
              onClick={handleSolve}
              disabled={!problem}
              data-testid="solve-button"
            >
              求解
            </button>
          </div>

          <textarea
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            spellCheck={false}
            rows={24}
            data-testid="editor"
            aria-label="问题 JSON 编辑器"
          />

          {errors && (
            <div className="errors" data-testid="error-list" role="alert">
              <h2>结构错误（{errors.length}）</h2>
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>
                    <code>{e.path}</code>：{e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {solveError && !errors && (
            <p className="solve-error" role="alert">
              {solveError}
            </p>
          )}
          {!errors && (
            <p className="hint" data-testid="valid-hint">
              结构合法：{problem!.fragments.length} 个碎片，{problem!.strips.length} 条候选条带。
              {result ? '' : '修改内容会使当前结果失效，需重新求解。'}
            </p>
          )}
        </section>

        <section className="output">
          {result ? (
            result.ok ? (
              <SolutionView problem={problem!} result={result} />
            ) : (
              <FailureView deadEnds={result.deadEnds} />
            )
          ) : (
            <div className="placeholder" data-testid="no-result">
              <p>{errors ? '存在结构错误，旧解已清除。' : '尚无结果：点击「求解」开始搜索。'}</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

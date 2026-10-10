import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useLocation } from 'react-router-dom';
import { api, type Problem, type Review } from '../lib/api';
import { ErrorBox, Field, Loader, Segmented, TopicPicker, useTopics } from '../components/ui';
import { runTests, type RunOutput } from '../lib/runner';
import Walkthrough, { type WtStep } from '../components/Walkthrough';
import { speak, stopSpeaking } from '../lib/voice';

const LANGS = ['javascript', 'typescript', 'rust', 'dart', 'python', 'sql'] as const;
const DIFFS = ['warm-up', 'easy', 'medium', 'hard'] as const;
const LANG_LABEL = { javascript: 'JavaScript', typescript: 'TypeScript', rust: 'Rust', dart: 'Dart', python: 'Python', sql: 'SQL' };
const MONACO_LANG: Record<string, string> = { javascript: 'javascript', typescript: 'typescript', rust: 'rust', dart: 'dart', python: 'python', sql: 'sql' };

export default function Lab() {
  const topics = useTopics();
  const preset = (useLocation().state as { topic?: string; language?: (typeof LANGS)[number] } | null) ?? {};
  const [topic, setTopic] = useState([preset.topic ?? 'javascript']);
  const [lang, setLang] = useState<(typeof LANGS)[number]>(preset.language ?? 'javascript');
  const [diff, setDiff] = useState<(typeof DIFFS)[number]>('warm-up');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'' | 'gen' | 'run' | 'review' | 'hint' | 'explain'>('');
  const [wt, setWt] = useState<{ title: string; steps: WtStep[] } | null>(null);
  const [err, setErr] = useState('');
  const [run, setRun] = useState<RunOutput | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [secs, setSecs] = useState(0);
  const timer = useRef<number>();

  const executable = lang === 'javascript' || lang === 'typescript';

  useEffect(() => {
    if (!problem) return;
    setSecs(0);
    timer.current = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(timer.current);
  }, [problem]);

  const generate = async () => {
    setBusy('gen'); setErr(''); setRun(null); setReview(null); setHints([]);
    try {
      const p = await api.challenge({ topic: topic[0], language: lang, difficulty: diff });
      setProblem(p); setCode(p.starter?.[lang] ?? '');
    } catch (e) { setErr((e as Error).message); }
    setBusy('');
  };

  const switchLang = (l: (typeof LANGS)[number]) => {
    setLang(l);
    if (problem?.starter?.[l] && (!code.trim() || code === problem.starter[lang])) setCode(problem.starter[l]);
  };

  const exec = async () => {
    if (!problem) return;
    setBusy('run'); setReview(null);
    setRun(await runTests(code, lang, problem.functionName, problem.tests));
    setBusy('');
  };

  const submit = async () => {
    if (!problem) return;
    setBusy('review'); setErr('');
    try {
      const results = executable ? (run ?? (await runTests(code, lang, problem.functionName, problem.tests))) : null;
      if (results) setRun(results);
      setReview(await api.review({
        problem, code, language: lang,
        runResults: results ? { error: results.error, passed: results.results.filter((r) => r.pass).length, total: results.results.length } : undefined,
      }));
    } catch (e) { setErr((e as Error).message); }
    setBusy('');
  };

  const hint = async () => {
    if (!problem) return;
    setBusy('hint');
    try { const h = await api.hint({ problem, code, level: Math.min(hints.length + 1, 3) }); setHints((x) => [...x, h.hint]); } catch (e) { setErr((e as Error).message); }
    setBusy('');
  };

  const explain = async () => {
    if (!problem) return;
    setBusy('explain'); setErr('');
    try { setWt(await api.explain({ kind: 'problem', problem, language: lang })); } catch (e) { setErr((e as Error).message); }
    setBusy('');
  };

  const passed = run?.results.filter((r) => r.pass).length ?? 0;
  const mm = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <div className="fade stack" style={{ gap: 20 }}>
      <div className="page-head"><div><h1>Code <span className="grad">Lab</span></h1><p>A fresh problem every time. JS/TS run in a sandbox here; other languages are traced and reviewed by the AI.</p></div></div>

      <div className="card row" style={{ gap: 28, alignItems: 'flex-end' }}>
        <Field label="Topic"><TopicPicker topics={topics.filter((t) => !['behavioral', 'system-design'].includes(t.id))} value={topic} onChange={setTopic} single /></Field>
        <Field label="Language"><Segmented options={LANGS} value={lang} onChange={switchLang} labels={LANG_LABEL} /></Field>
        <Field label="Difficulty"><Segmented options={DIFFS} value={diff} onChange={setDiff} /></Field>
        <button className="btn primary" disabled={!!busy} onClick={generate}>{busy === 'gen' ? 'Generating…' : problem ? 'New problem' : 'Generate problem'}</button>
      </div>
      <ErrorBox msg={err} />
      {wt && <Walkthrough title={wt.title} steps={wt.steps} onClose={() => setWt(null)} />}
      {busy === 'gen' && <Loader label="designing a problem and checking its test cases" />}

      {problem && (
        <div className="lab">
          <div className="card stack">
            <div className="row between"><h2>{problem.title}</h2><span className="timer">{mm}</span></div>
            <div className="row"><span className="tag">{problem.difficulty}</span>{problem.complexity && <span className="tag v">target {problem.complexity}</span>}</div>
            <div className="plain">
              <span className="label">In plain words</span>
              <p>{problem.simple ?? problem.description}</p>
            </div>
            <div className="row">
              <button className="btn sm primary" disabled={!!busy} onClick={explain}>{busy === 'explain' ? 'Preparing…' : '▶ Explain it to me'}</button>
              <button className="btn sm" onClick={() => speak(problem.simple ?? problem.description)}>🔊 Read aloud</button>
              <button className="btn sm ghost" onClick={stopSpeaking}>■</button>
            </div>
            <details><summary className="muted" style={{ cursor: 'pointer' }}>Full spec</summary><div className="md" style={{ marginTop: 8 }}>{problem.description.split('\n').filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}</div></details>
            <div><span className="label">Examples</span>
              <div className="stack" style={{ gap: 8 }}>{problem.examples?.map((e, i) => (
                <pre key={i} className="code">{`in:  ${e.input}\nout: ${e.output}${e.note ? `\n// ${e.note}` : ''}`}</pre>
              ))}</div>
            </div>
            {hints.map((h, i) => <p key={i} className="fb"><b className="muted">Hint {i + 1}: </b>{h}</p>)}
            <button className="btn sm" disabled={!!busy || hints.length >= 3} onClick={hint}>{busy === 'hint' ? 'Thinking…' : `Hint (${hints.length}/3)`}</button>
          </div>

          <div className="stack">
            <div className="editor">
              <Editor
                theme="vs-dark" language={MONACO_LANG[lang]} value={code} onChange={(v) => setCode(v ?? '')}
                options={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, minimap: { enabled: false }, padding: { top: 14 }, scrollBeyondLastLine: false, smoothScrolling: true, cursorBlinking: 'smooth' }}
                onMount={(_e, monaco) => monaco.editor.defineTheme('nexus', { base: 'vs-dark', inherit: true, rules: [], colors: { 'editor.background': '#080a16' } }) && monaco.editor.setTheme('nexus')}
              />
            </div>
            <div className="row">
              {executable && <button className="btn" disabled={!!busy} onClick={exec}>▶ Run tests</button>}
              <button className="btn primary" disabled={!!busy} onClick={submit}>{busy === 'review' ? 'Reviewing…' : 'Submit for AI review'}</button>
              {!executable && <span className="muted" style={{ fontSize: '0.85rem' }}>Not executed locally — the AI will trace it against the tests.</span>}
            </div>

            {run && (
              <div className="card stack" style={{ gap: 10 }}>
                <div className="row between"><span className="label" style={{ margin: 0 }}>Tests</span><span className={`tag ${passed === run.results.length && !run.error ? 'good' : 'bad'}`}>{passed}/{run.results.length} passed</span></div>
                {run.error && <ErrorBox msg={run.error} />}
                {run.results.map((r, i) => (
                  <div key={i} className={`test ${r.pass ? 'pass' : 'fail'}`}>
                    <span>{r.pass ? '✓' : '✗'}</span>
                    <div>
                      <div>f({r.args.map((a) => JSON.stringify(a)).join(', ')})</div>
                      {!r.pass && <div className="muted">expected {JSON.stringify(r.expected)} · got {r.error ?? JSON.stringify(r.got)}</div>}
                    </div>
                  </div>
                ))}
                {run.logs.length > 0 && <pre className="code">{run.logs.join('\n')}</pre>}
              </div>
            )}

            {review && (
              <div className="card glow stack fade">
                <div className="row between"><span className="label" style={{ margin: 0 }}>AI review</span><span className={`tag ${review.passed ? 'good' : 'bad'}`}>{review.passed ? 'Accepted' : 'Needs work'} · {review.score}/100</span></div>
                <p><b>Correctness.</b> {review.correctness}</p>
                <p><b>Complexity.</b> {review.complexity}</p>
                <p><b>Quality.</b> {review.quality}</p>
                <ul className="list">{review.improvements?.map((x, i) => <li key={i}>{x}</li>)}</ul>
                <details><summary className="muted" style={{ cursor: 'pointer' }}>Reveal a better solution</summary><pre className="code" style={{ marginTop: 10 }}>{review.betterSolution}</pre></details>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, type QuizQ } from '../lib/api';
import { ErrorBox, Field, Loader, Segmented, TopicPicker, topicName, useTopics } from '../components/ui';

const LEVELS = ['junior', 'mid', 'senior', 'staff'] as const;

export default function Quiz() {
  const topics = useTopics();
  const preset = (useLocation().state as { topics?: string[] } | null)?.topics;
  const [sel, setSel] = useState(preset ?? ['javascript', 'rust', 'database']);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('mid');
  const [qs, setQs] = useState<QuizQ[] | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [results, setResults] = useState<{ topic: string; correct: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const start = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.quiz({ topics: sel, level, count: 8 });
      if (!r.questions.length) throw new Error('The model returned no usable questions — try again.');
      setQs(r.questions); setI(0); setPicked(null); setResults([]);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  const pick = (n: number) => {
    if (picked !== null || !qs) return;
    setPicked(n);
    setResults((r) => [...r, { topic: qs[i].topic, correct: n === qs[i].answerIndex }]);
  };

  const next = () => {
    if (!qs) return;
    if (i + 1 >= qs.length) { api.quizResult({ level, results }); setI(qs.length); return; }
    setI(i + 1); setPicked(null);
  };

  if (!qs || (qs && i >= qs.length)) {
    const done = qs && i >= qs.length;
    const score = results.filter((r) => r.correct).length;
    return (
      <div className="fade stack" style={{ gap: 20, maxWidth: 820 }}>
        <div className="page-head"><div><h1>Rapid <span className="grad">Quiz</span></h1><p>Eight tricky questions, freshly written. Explanations after each.</p></div></div>
        {done && (
          <div className="card glow row between">
            <div><span className="label">Result</span><div className="num grad" style={{ fontSize: '2.6rem', fontWeight: 700 }}>{score}/{results.length}</div></div>
            <div className="row">{[...new Set(results.map((r) => r.topic))].map((t) => {
              const rs = results.filter((r) => r.topic === t);
              return <span key={t} className={`tag ${rs.every((r) => r.correct) ? 'good' : 'warn'}`}>{topicName(topics, t)} {rs.filter((r) => r.correct).length}/{rs.length}</span>;
            })}</div>
          </div>
        )}
        <div className="card stack" style={{ gap: 22 }}>
          <Field label="Topics"><TopicPicker topics={topics} value={sel} onChange={setSel} /></Field>
          <Field label="Level"><Segmented options={LEVELS} value={level} onChange={setLevel} /></Field>
          <ErrorBox msg={err} />
          <div className="row"><button className="btn primary" disabled={busy || !sel.length} onClick={start}>{busy ? 'Writing questions…' : done ? 'Play again' : 'Start quiz'}</button>{busy && <Loader />}</div>
        </div>
      </div>
    );
  }

  const q = qs[i];
  return (
    <div className="fade stack" style={{ gap: 18, maxWidth: 820 }}>
      <div className="progress">{qs.map((_, k) => <i key={k} className={k < i ? 'done' : k === i ? 'cur' : ''} />)}</div>
      <div className="card glow stack" style={{ gap: 18 }}>
        <div className="row between"><span className="tag">{topicName(topics, q.topic)}</span><span className="muted mono">{i + 1}/{qs.length}</span></div>
        <h2 style={{ fontWeight: 500, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{q.q}</h2>
        <div className="stack" style={{ gap: 10 }}>
          {q.options.map((o, k) => (
            <button key={k} disabled={picked !== null} onClick={() => pick(k)}
              className={`opt ${picked !== null ? (k === q.answerIndex ? 'right' : k === picked ? 'wrong' : '') : ''}`}>
              <span className="k">{'ABCD'[k]}</span><span style={{ whiteSpace: 'pre-wrap' }}>{o}</span>
            </button>
          ))}
        </div>
        {picked !== null && (
          <div className="stack fade">
            <p className="fb">{q.explanation}</p>
            <button className="btn primary" onClick={next}>{i + 1 >= qs.length ? 'See results' : 'Next →'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

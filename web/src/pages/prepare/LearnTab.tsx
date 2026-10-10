import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { prep, type ModuleInfo } from '../../lib/api';
import { ErrorBox, Loader, topicName, useTopics } from '../../components/ui';
import Walkthrough, { type WtStep } from '../../components/Walkthrough';
import { speak, stopSpeaking } from '../../lib/voice';
import { api } from '../../lib/api';

export default function LearnTab({ focus, initialTopic, initialModule, go }: {
  focus: string[]; initialTopic: string | null; initialModule: string | null; go: (t: string, e?: Record<string, string>) => void;
}) {
  const topics = useTopics();
  const [topic, setTopic] = useState(initialTopic ?? focus[0] ?? 'javascript');
  const [modules, setModules] = useState<ModuleInfo[] | null>(null);
  const [current, setCurrent] = useState<string | null>(initialModule);
  const [lesson, setLesson] = useState<{ markdown: string; done?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [wt, setWt] = useState<{ title: string; steps: WtStep[] } | null>(null);
  const [reading, setReading] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const load = useCallback(async (t: string, title: string, refresh = false) => {
    setCurrent(title); setBusy(true); setErr(''); if (refresh) setLesson(null);
    try {
      const l = await prep.lesson(t, title, refresh);
      setLesson(l);
      setModules((m) => m?.map((x) => (x.title === title ? { ...x, cached: true } : x)) ?? m);
      top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }, []);

  useEffect(() => {
    setModules(null); setLesson(null); setErr('');
    prep.curriculum(topic).then((c) => {
      setModules(c.modules);
      if (current && c.modules.some((m) => m.title === current)) load(topic, current);
      else setCurrent(null);
    }).catch((e) => setErr(e.message));
  }, [topic]); // eslint-disable-line

  const markDone = async () => {
    if (!current || !lesson) return;
    const done = !lesson.done;
    await prep.lessonDone(topic, current, done);
    setLesson({ ...lesson, done });
    setModules((m) => m?.map((x) => (x.title === current ? { ...x, done } : x)) ?? m);
  };

  const makeCards = async () => {
    if (!current) return;
    setToast('Writing flashcards…');
    try { const r = await prep.genCards(topic, current, 8); setToast(`Added ${r.added} cards to your ${topicName(topics, topic)} deck`); } catch (e) { setToast((e as Error).message); }
    setTimeout(() => setToast(''), 4000);
  };

  const explain = async () => {
    if (!current || !lesson) return;
    setToast('Preparing visual recap…');
    try { setWt(await api.explain({ kind: 'lesson', topic, title: current, markdown: lesson.markdown })); setToast(''); } catch (e) { setToast((e as Error).message); setTimeout(() => setToast(''), 4000); }
  };

  const listen = () => {
    if (reading) { stopSpeaking(); setReading(false); return; }
    // read prose only: drop code blocks, tables and markdown symbols
    const text = (lesson?.markdown ?? '').replace(/```[\s\S]*?```/g, ' (code example on screen). ').replace(/^\|.*$/gm, '').replace(/[#*_`>|-]/g, '').replace(/\n{2,}/g, '. ').slice(0, 6000);
    setReading(true);
    speak(text, () => setReading(false));
  };

  useEffect(() => () => stopSpeaking(), []);

  const doneCount = modules?.filter((m) => m.done).length ?? 0;
  const idx = modules?.findIndex((m) => m.title === current) ?? -1;
  const next = modules && idx >= 0 ? modules[idx + 1] : undefined;

  return (
    <div className="lab" style={{ gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)' }}>
      <div className="stack" style={{ position: 'sticky', top: 16 }}>
        <div className="row" style={{ gap: 8 }}>
          {[...new Set([...focus, topic])].map((t) => (
            <button key={t} className={`chip ${topic === t ? 'on' : ''}`} onClick={() => { setCurrent(null); setTopic(t); }}>{topicName(topics, t)}</button>
          ))}
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div className="row between" style={{ padding: '4px 8px 10px' }}>
            <span className="label" style={{ margin: 0 }}>Syllabus</span>
            <span className="mono muted" style={{ fontSize: '0.8rem' }}>{doneCount}/{modules?.length ?? 0}</span>
          </div>
          {!modules && <div style={{ padding: 10 }}><Loader label="loading syllabus" /></div>}
          <div className="stack" style={{ gap: 4, maxHeight: '62vh', overflowY: 'auto' }}>
            {modules?.map((m, i) => (
              <button key={m.title} onClick={() => load(topic, m.title)} className="opt" style={{ padding: '10px 12px', borderRadius: 12, ...(current === m.title ? { borderColor: 'var(--cyan)', background: 'rgba(34,211,238,0.1)' } : {}) }}>
                <span className="k">{m.done ? '✓' : String(i + 1).padStart(2, '0')}</span>
                <span style={{ flex: 1, fontSize: '0.9rem', opacity: m.done ? 0.6 : 1 }}>{m.title}{m.cached && !m.done && <span className="muted"> ·</span>}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={top} className="card glow" style={{ minHeight: 360, scrollMarginTop: 16 }}>
        {!current && !busy && (
          <div className="stack" style={{ padding: 20 }}>
            <h2>Pick a module to start</h2>
            <p className="muted">Each lesson is written for your level, with worked examples, the questions interviewers actually ask, traps, and a self-test. Lessons are saved so they open instantly next time.</p>
            {modules && <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => load(topic, (modules.find((m) => !m.done) ?? modules[0]).title)}>Start with the next unfinished module →</button>}
          </div>
        )}
        {busy && <div className="stack" style={{ padding: 20 }}><h2>{current}</h2><Loader label="writing your lesson — about 20 seconds the first time" /></div>}
        <ErrorBox msg={err} />
        {lesson && !busy && (
          <div className="stack fade" style={{ gap: 18 }}>
            <div className="row between">
              <div><span className="label" style={{ margin: 0 }}>{topicName(topics, topic)}</span><h2 style={{ fontSize: '1.4rem', marginTop: 4 }}>{current}</h2></div>
              <div className="row">
                <button className="btn sm primary" onClick={explain}>▶ Visual recap</button>
                <button className="btn sm" onClick={listen}>{reading ? '■ Stop' : '🔊 Listen'}</button>
                <button className="btn sm" onClick={makeCards}>+ Flashcards</button>
                <button className="btn sm ghost" onClick={() => current && load(topic, current, true)}>Rewrite</button>
                <button className={`btn sm ${lesson.done ? '' : 'primary'}`} onClick={markDone}>{lesson.done ? '✓ Completed' : 'Mark complete'}</button>
              </div>
            </div>
            {toast && <div className="tag good" style={{ alignSelf: 'flex-start' }}>{toast}</div>}
            <div className="lesson"><ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.markdown}</ReactMarkdown></div>
            <div className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
              <div className="row">
                <button className="btn sm" onClick={() => go('cards', { topic })}>Review flashcards</button>
                <button className="btn sm" onClick={() => go('leetcode', { kind: topic === 'database' ? 'database' : topic === 'javascript' ? 'javascript' : '' })}>Practice on LeetCode</button>
              </div>
              {next && <button className="btn primary" onClick={() => load(topic, next.title)}>Next: {next.title} →</button>}
            </div>
          </div>
        )}
      </div>
      {wt && <Walkthrough title={wt.title} steps={wt.steps} onClose={() => setWt(null)} />}
    </div>
  );
}

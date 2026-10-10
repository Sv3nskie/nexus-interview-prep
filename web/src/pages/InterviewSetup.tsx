import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ErrorBox, Field, Loader, Segmented, TopicPicker, useTopics } from '../components/ui';
import { sttSupported } from '../lib/voice';

const LEVELS = ['junior', 'mid', 'senior', 'staff'] as const;
const STYLES = ['mixed', 'technical', 'behavioral', 'system-design'] as const;
const INPUTS = ['text', 'voice'] as const;

export default function InterviewSetup() {
  const nav = useNavigate();
  const preset = (useLocation().state as { topics?: string[] } | null)?.topics;
  const topics = useTopics();
  const [sel, setSel] = useState<string[]>(preset ?? ['javascript', 'rust', 'database']);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('mid');
  const [style, setStyle] = useState<(typeof STYLES)[number]>('mixed');
  const [input, setInput] = useState<(typeof INPUTS)[number]>('text');
  const [video, setVideo] = useState(false);
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const start = async () => {
    setBusy(true); setErr('');
    try {
      const s = await api.startInterview({ topics: sel, level, style, count, input: video ? 'voice' : input, video });
      nav(`/interview/${s.id}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  const voice = input === 'voice' || video;
  return (
    <div className="fade stack" style={{ gap: 22, maxWidth: 900 }}>
      <div className="page-head"><div><h1>Configure your <span className="grad">interview</span></h1><p>Questions are generated live: no two sessions are the same.</p></div></div>
      <div className="card glow stack" style={{ gap: 24 }}>
        <Field label="Topics (pick any mix)"><TopicPicker topics={topics} value={sel} onChange={setSel} /></Field>
        <div className="row" style={{ gap: 32, alignItems: 'flex-start' }}>
          <Field label="Level"><Segmented options={LEVELS} value={level} onChange={setLevel} /></Field>
          <Field label="Style"><Segmented options={STYLES} value={style} onChange={setStyle} /></Field>
        </div>
        <div className="row" style={{ gap: 32, alignItems: 'flex-start' }}>
          <Field label="Answer by"><Segmented options={INPUTS} value={voice ? 'voice' : input} onChange={setInput} /></Field>
          <Field label="Camera practice">
            <button type="button" className={`chip ${video ? 'on' : ''}`} onClick={() => setVideo(!video)}>{video ? 'Camera on · recorded locally' : 'Camera off'}</button>
          </Field>
          <Field label={`Questions: ${count}`}><input type="range" min={3} max={12} value={count} onChange={(e) => setCount(+e.target.value)} /></Field>
        </div>
        {voice && !sttSupported && <ErrorBox msg="Voice dictation needs Chrome or Edge. You can still type your answers during the session." />}
        {voice && <p className="muted" style={{ fontSize: '0.85rem' }}>The interviewer will speak each question aloud. Answer by speaking; your delivery (pace, filler words) is scored too. Video never leaves your browser.</p>}
        <ErrorBox msg={err} />
        <div className="row">
          <button className="btn primary" disabled={busy || !sel.length && style !== 'behavioral' && style !== 'system-design'} onClick={start}>
            {busy ? 'Preparing your interviewer…' : 'Begin interview →'}
          </button>
          {busy && <Loader label="first question is being written" />}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { isMuted, speak, stopSpeaking } from '../lib/voice';

export interface WtShow { kind?: 'array' | 'kv' | 'stack' | 'code' | 'text'; items?: unknown[]; highlight?: number[]; pointers?: Record<string, number>; caption?: string }
export interface WtStep { say: string; show?: WtShow }

const str = (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x));

function Stage({ show }: { show?: WtShow }) {
  const items = (show?.items ?? []).map(str);
  const hi = new Set(show?.highlight ?? []);
  const ptr = Object.entries(show?.pointers ?? {});
  if (!show?.kind || !items.length) return <div className="wt-text grad">…</div>;

  let body;
  if (show.kind === 'text') body = <div className="wt-text grad">{items.join(' ')}</div>;
  else if (show.kind === 'array') {
    body = (
      <div className="wt-array">
        {items.map((it, i) => (
          <div key={i} className="wt-col">
            <div className={`wt-cell ${hi.has(i) ? 'hi' : ''}`}>{it}</div>
            <div className="wt-idx">{i}</div>
            <div className="wt-ptrs">{ptr.filter(([, at]) => at === i).map(([name]) => <span key={name} className="wt-ptr">↑ {name}</span>)}</div>
          </div>
        ))}
      </div>
    );
  } else if (show.kind === 'kv') {
    body = (
      <div className="wt-kv">
        {items.map((it, i) => { const [k, ...v] = it.split('='); return <div key={i} className={`wt-row ${hi.has(i) ? 'hi' : ''}`}><b>{k}</b><span>{v.join('=') || '—'}</span></div>; })}
      </div>
    );
  } else if (show.kind === 'stack') {
    body = <div className="wt-stack">{items.map((it, i) => <div key={i} className={`wt-cell wide ${hi.has(i) ? 'hi' : ''}`}>{it}</div>)}</div>;
  } else {
    body = <pre className="wt-code">{items.map((l, i) => <div key={i} className={hi.has(i) ? 'hi' : ''}>{l}</div>)}</pre>;
  }
  return <>{body}{show.caption && <div className="wt-cap">{show.caption}</div>}</>;
}

/** Narrated, auto-advancing explainer. Audio uses the browser's built-in speech synthesis (free). */
export default function Walkthrough({ title, steps, onClose }: { title: string; steps: WtStep[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [silent, setSilent] = useState(isMuted() || !window.speechSynthesis);
  const step = steps[i];
  const timer = useRef<number>();

  useEffect(() => {
    if (!playing) return;
    let alive = true; // guards against callbacks from utterances we cancelled
    const next = () => { if (alive) timer.current = window.setTimeout(() => alive && setI((n) => (n + 1 < steps.length ? n + 1 : (setPlaying(false), n))), 700); };
    if (silent) {
      const words = step.say.split(/\s+/).length;
      timer.current = window.setTimeout(() => alive && next(), Math.max(2200, words * 380));
    } else speak(step.say, next);
    return () => { alive = false; clearTimeout(timer.current); stopSpeaking(); };
  }, [i, playing, silent, steps.length]); // eslint-disable-line

  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => Math.min(steps.length - 1, n + 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, steps.length]);

  const atEnd = i === steps.length - 1 && !playing;

  return (
    <div className="wt-backdrop" onClick={onClose}>
      <div className="wt card glow" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <span className="label" style={{ margin: 0 }}>{title}</span>
          <button className="btn sm ghost" onClick={onClose}>✕ Close</button>
        </div>
        <div className="wt-stage" key={i}><Stage show={step.show} /></div>
        <p className="wt-say" key={`s${i}`}>{step.say}</p>
        <div className="progress">{steps.map((_, k) => <i key={k} className={k < i ? 'done' : k === i ? 'cur' : ''} onClick={() => setI(k)} style={{ cursor: 'pointer' }} />)}</div>
        <div className="row between">
          <div className="row">
            <button className="btn sm" disabled={i === 0} onClick={() => setI(i - 1)}>‹ Back</button>
            <button className="btn sm primary" onClick={() => { if (atEnd) { setI(0); setPlaying(true); } else setPlaying(!playing); }}>
              {atEnd ? '↺ Replay' : playing ? '❚❚ Pause' : '▶ Play'}
            </button>
            <button className="btn sm" disabled={i === steps.length - 1} onClick={() => setI(i + 1)}>Next ›</button>
          </div>
          <button className="btn sm ghost" onClick={() => setSilent(!silent)}>{silent ? '🔇 Audio off' : '🔊 Audio on'}</button>
        </div>
      </div>
    </div>
  );
}

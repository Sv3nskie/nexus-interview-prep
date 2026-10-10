import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type Topic } from '../lib/api';

const P = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
export const Icon = {
  home: P('M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10'),
  mic: P('M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3'),
  code: P('M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16'),
  book: P('M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 1 2-2h13M9 7h6'),
  quiz: P('M9 9a3 3 0 1 1 4 2.8c-.7.4-1 1-1 1.7M12 17h.01M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0'),
  history: P('M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2'),
  cog: P('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.2-1.3L14 3h-4l-.4 2.5a7 7 0 0 0-2.2 1.3l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .9.1 1.3l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.2 1.3L10 21h4l.4-2.5a7 7 0 0 0 2.2-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z'),
};

export function Loader({ label }: { label?: string }) {
  return <div className="loader"><i /><i /><i />{label && <span style={{ marginLeft: 6 }}>{label}</span>}</div>;
}

export const ErrorBox = ({ msg }: { msg: string }) => (msg ? <div className="err">{msg}</div> : null);

export function useTopics(): Topic[] {
  const [t, setT] = useState<Topic[]>([]);
  useEffect(() => { api.config().then((c) => setT(c.topics)); }, []);
  return t;
}

export function TopicPicker({ topics, value, onChange, single }: { topics: Topic[]; value: string[]; onChange: (v: string[]) => void; single?: boolean }) {
  const toggle = (id: string) => {
    if (single) return onChange([id]);
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };
  return (
    <div className="row" style={{ gap: 8 }}>
      {topics.map((t) => (
        <button key={t.id} type="button" className={`chip ${value.includes(t.id) ? 'on' : ''}`} onClick={() => toggle(t.id)} title={t.focus}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Partial<Record<T, string>> }) {
  return (
    <div className="seg">
      {options.map((o) => <button key={o} type="button" className={o === value ? 'on' : ''} onClick={() => onChange(o)}>{labels?.[o] ?? o.replace('-', ' ')}</button>)}
    </div>
  );
}

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div><span className="label">{label}</span>{children}</div>
);

export const scoreClass = (s: number) => (s >= 70 ? 'good' : s >= 45 ? 'warn' : 'bad');
export const topicName = (topics: Topic[], id: string) => topics.find((t) => t.id === id)?.label ?? id;

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

export function DatePicker({ value, onChange, min }: { value: string; onChange: (v: string) => void; min?: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => (value ? parseYmd(value) : new Date()));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const pick = (d: Date) => { onChange(ymd(d)); setView(d); setOpen(false); };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const minD = min ? parseYmd(min) : today;
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // week starts Monday
  const cells = Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i));
  const sel = value ? parseYmd(value) : null;
  const inDays = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  const daysAway = sel ? Math.round((+sel - +today) / 864e5) : null;
  const shift = (m: number) => setView(new Date(view.getFullYear(), view.getMonth() + m, 1));

  return (
    <div className="dp" ref={ref}>
      <button type="button" className="dp-btn" onClick={() => { setOpen(!open); if (value) setView(parseYmd(value)); }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        <span>{sel ? sel.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Pick a date'}</span>
        {daysAway !== null && daysAway >= 0 && <span className="tag">{daysAway === 0 ? 'today' : `in ${daysAway}d`}</span>}
      </button>
      {open && (
        <div className="dp-pop fade">
          <div className="row between" style={{ marginBottom: 10 }}>
            <button type="button" className="btn sm ghost" onClick={() => shift(-1)}>‹</button>
            <b>{view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
            <button type="button" className="btn sm ghost" onClick={() => shift(1)}>›</button>
          </div>
          <div className="dp-grid">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="dp-dow">{d}</span>)}
            {cells.map((d) => {
              const off = d.getMonth() !== view.getMonth();
              const dis = d < minD;
              const cls = ['dp-day', off && 'off', +d === +today && 'today', sel && +d === +sel && 'sel'].filter(Boolean).join(' ');
              return <button key={+d} type="button" disabled={dis} className={cls} onClick={() => pick(d)}>{d.getDate()}</button>;
            })}
          </div>
          <div className="row" style={{ gap: 6, marginTop: 12 }}>
            {[[3, '3 days'], [7, '1 week'], [14, '2 weeks'], [30, '1 month']].map(([n, l]) => (
              <button key={n} type="button" className="chip" style={{ padding: '5px 10px', fontSize: '0.78rem' }} onClick={() => pick(inDays(n as number))}>{l}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

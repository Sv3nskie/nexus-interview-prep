import { useCallback, useEffect, useState } from 'react';
import { prep, type Card } from '../../lib/api';
import { ErrorBox, Loader, topicName, useTopics } from '../../components/ui';

const GRADES = [
  ['Again', 'bad', '1'], ['Hard', 'warn', '2'], ['Good', 'good', '3'], ['Easy', '', '4'],
] as const;

export default function CardsTab({ focus, initialTopic }: { focus: string[]; initialTopic: string | null }) {
  const topics = useTopics();
  const [topic, setTopic] = useState(initialTopic ?? focus[0] ?? 'javascript');
  const [queue, setQueue] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, { total: number; due: number }>>({});
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reviewed, setReviewed] = useState(0);

  const refresh = useCallback(async () => {
    const [d, all] = await Promise.all([prep.due(topic), prep.decks()]);
    setQueue(d.cards); setTotal(d.total); setShow(false);
    setStats(Object.fromEntries(all.map((x) => [x.topic, x])));
  }, [topic]);
  useEffect(() => { setReviewed(0); refresh().catch((e) => setErr(e.message)); }, [refresh]);

  const generate = async () => {
    setBusy(true); setErr('');
    try { await prep.genCards(topic, undefined, 12); await refresh(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  const grade = useCallback(async (g: number) => {
    const card = queue[0];
    if (!card) return;
    setQueue((q) => q.slice(1)); setShow(false); setReviewed((n) => n + 1);
    const updated = await prep.review(topic, card.id, g);
    if (g === 0) setQueue((q) => [...q, updated]); // see it again this session
  }, [queue, topic]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); setShow(true); }
      else if (show && '1234'.includes(e.key) && e.key) grade(+e.key - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, grade]);

  const card = queue[0];
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 820 }}>
      <div className="row" style={{ gap: 8 }}>
        {[...new Set([...focus, topic])].map((t) => (
          <button key={t} className={`chip ${topic === t ? 'on' : ''}`} onClick={() => setTopic(t)}>
            {topicName(topics, t)}{stats[t] ? ` · ${stats[t].due} due` : ''}
          </button>
        ))}
      </div>
      <ErrorBox msg={err} />

      {card ? (
        <div className="card glow stack fade" style={{ gap: 20, minHeight: 280 }} key={card.id}>
          <div className="row between"><span className="tag">{queue.length} left</span><span className="muted mono" style={{ fontSize: '0.8rem' }}>deck {total} · reviewed {reviewed}</span></div>
          <p style={{ fontSize: '1.3rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{card.front}</p>
          {show ? (
            <>
              <div className="quote fb" style={{ fontSize: '1rem' }}>{card.back}</div>
              <div className="row">
                {GRADES.map(([name, cls, k], i) => (
                  <button key={name} className={`btn ${cls === 'bad' ? 'danger' : ''}`} onClick={() => grade(i)}>{name} <span className="muted mono" style={{ fontSize: '0.75rem' }}>{k}</span></button>
                ))}
              </div>
            </>
          ) : (
            <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => setShow(true)}>Show answer <span className="mono" style={{ opacity: 0.6 }}>space</span></button>
          )}
        </div>
      ) : (
        <div className="card stack" style={{ gap: 14 }}>
          <h2>{total ? (reviewed ? 'All caught up 🎉' : 'Nothing due right now') : `No ${topicName(topics, topic)} cards yet`}</h2>
          <p className="muted">{total ? `${total} cards in this deck. Cards come back on a schedule based on how well you knew them.` : 'Generate a deck and review it a few minutes a day — spaced repetition is the most efficient way to retain definitions, gotchas and trade-offs.'}</p>
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={generate}>{busy ? 'Writing cards…' : total ? '+ 12 more cards' : 'Generate 12 cards'}</button>
            {busy && <Loader />}
          </div>
        </div>
      )}
    </div>
  );
}

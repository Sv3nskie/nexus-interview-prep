import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Session } from '../lib/api';
import { ErrorBox, Loader, scoreClass, topicName, useTopics } from '../components/ui';
import { recordings } from '../lib/voice';

const SIGNAL: Record<string, [string, string]> = {
  strong_no: ['Strong no hire', 'bad'], no: ['No hire', 'bad'], lean_no: ['Leaning no', 'warn'],
  lean_yes: ['Leaning hire', 'good'], yes: ['Hire', 'good'], strong_yes: ['Strong hire', 'good'],
};

export default function ReportPage() {
  const { id = '' } = useParams();
  const topics = useTopics();
  const [s, setS] = useState<Session | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.getInterview(id).then(async (x) => {
      if (!x.report) x = await api.finish(id);
      setS(x);
    }).catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <ErrorBox msg={err} />;
  if (!s?.report) return <Loader label="compiling your report" />;
  const r = s.report;
  const [sigLabel, sigClass] = SIGNAL[r.hireSignal] ?? [r.hireSignal, 'warn'];
  const rec = recordings.get(id);
  const delivery = s.turns.filter((t) => t.metrics?.source === 'voice');
  const avg = (f: (m: NonNullable<(typeof delivery)[0]['metrics']>) => number) => delivery.length ? Math.round(delivery.reduce((a, t) => a + f(t.metrics!), 0) / delivery.length) : 0;

  return (
    <div className="fade stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div><h1>Interview <span className="grad">report</span></h1><p>{new Date(s.createdAt).toLocaleString()} · {s.level} level · {s.config.topics.map((t) => topicName(topics, t)).join(', ')}</p></div>
        <Link to="/interview" className="btn primary">New interview</Link>
      </div>

      <div className="card glow row" style={{ gap: 32, alignItems: 'center' }}>
        <div className="ring" style={{ ['--v' as string]: r.overall }}><b>{r.overall}</b></div>
        <div className="stack" style={{ flex: 1, minWidth: 260 }}>
          <div className="row"><span className={`tag ${sigClass}`}>{sigLabel}</span><span className="tag">Depth {r.depth}</span><span className="tag v">Communication {r.communication}</span></div>
          <p>{r.verdict}</p>
        </div>
      </div>

      <div className="grid g2">
        <div className="card"><span className="label">Strengths</span><ul className="list good">{r.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div className="card"><span className="label">Work on</span><ul className="list bad">{r.weaknesses.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </div>

      <div className="grid g2">
        <div className="card">
          <span className="label">By topic</span>
          <div className="stack">
            {r.topicScores.map((t) => (
              <div key={t.topic}>
                <div className="row between" style={{ marginBottom: 6 }}><span>{topicName(topics, t.topic)}</span><span className="mono muted">{t.score}</span></div>
                <div className={`bar ${t.score < 50 ? 'low' : ''}`}><i style={{ width: `${t.score}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <span className="label">Delivery</span>
          {delivery.length ? (
            <div className="grid g3">
              <div className="stat"><div className="num">{avg((m) => m.wpm)}</div><div className="cap">words / min (aim 120–160)</div></div>
              <div className="stat"><div className="num">{avg((m) => m.fillers)}</div><div className="cap">filler words / answer</div></div>
              <div className="stat"><div className="num">{avg((m) => m.durationSec)}s</div><div className="cap">avg answer length</div></div>
            </div>
          ) : <p className="muted">Answer by voice to get pace and filler-word analytics.</p>}
          {rec && <video src={rec} controls style={{ width: '100%', marginTop: 14, borderRadius: 12 }} />}
        </div>
      </div>

      <div className="card">
        <span className="label">Your study plan</span>
        <div className="grid g3">
          {r.studyPlan.map((p, i) => (
            <div key={i} className="card" style={{ background: 'rgba(0,0,0,0.25)' }}>
              <span className="tag">{p.topic}</span>
              <p style={{ margin: '10px 0 6px' }}>{p.why}</p>
              <p className="muted" style={{ fontSize: '0.88rem' }}>▸ {p.practice}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="stack">
        <span className="label" style={{ margin: 0 }}>Question by question</span>
        {s.turns.filter((t) => t.evaluation).map((t, i) => (
          <details key={i} className="qa">
            <summary>
              <span className={`tag ${scoreClass(t.evaluation!.score * 10)}`}>{t.evaluation!.score}/10</span>
              <span style={{ flex: 1 }}>{t.question}</span>
              <span className="tag v">{topicName(topics, t.topic)}</span>
            </summary>
            <div className="body">
              <div><span className="label">Your answer</span><div className="quote">{t.answer}</div></div>
              <p className="fb">{t.evaluation!.summary}</p>
              <div><span className="label">Strong answer</span><div className="quote">{t.evaluation!.modelAnswer}</div></div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Stats } from '../lib/api';
import { Icon, scoreClass, topicName, useTopics } from '../components/ui';

export default function Dashboard() {
  const nav = useNavigate();
  const topics = useTopics();
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => { api.stats().then(setStats).catch(() => {}); }, []);

  const actions = [
    { to: '/prepare', title: 'Prepare', icon: Icon.book, text: 'Day-by-day plan, lessons, flashcards and LeetCode targets for JavaScript, Rust and Databases.' },
    { to: '/interview', title: 'Mock Interview', icon: Icon.mic, text: 'Adaptive questions, voice answers, optional camera. Follow-ups probe your weak spots.' },
    { to: '/lab', title: 'Code Lab', icon: Icon.code, text: 'Fresh problems every time in JS, TS, Rust, Dart, Python or SQL, reviewed by AI.' },
    { to: '/quiz', title: 'Rapid Quiz', icon: Icon.quiz, text: 'Tricky multiple-choice for quick daily reps, with explanations.' },
  ];

  return (
    <div className="stack fade" style={{ gap: 26 }}>
      <div className="page-head">
        <div>
          <h1>Ready to <span className="grad">level up</span>?</h1>
          <p>Every session generates new questions, tuned to your level and the topics you struggle with.</p>
        </div>
        <button className="btn primary" onClick={() => nav('/interview')}>Start interview →</button>
      </div>

      <div className="grid g4">
        {[
          ['Streak', `${stats?.streak ?? 0}d`, 'days practised in a row'],
          ['Interviews', stats?.interviews ?? 0, 'completed mock sessions'],
          ['Challenges solved', `${stats?.solved ?? 0}/${stats?.challenges ?? 0}`, 'code lab attempts'],
          ['Quizzes', stats?.quizzes ?? 0, 'rapid rounds taken'],
        ].map(([k, v, c]) => (
          <div className="card stat" key={k as string}><span className="label">{k}</span><div className="num grad">{v}</div><div className="cap">{c}</div></div>
        ))}
      </div>

      <div className="grid g4">
        {actions.map((a) => (
          <div key={a.to} className="card action-card" onClick={() => nav(a.to)}>
            <div className="ic">{a.icon}</div><h2>{a.title}</h2><p>{a.text}</p>
          </div>
        ))}
      </div>

      <div className="grid g2">
        <div className="card">
          <span className="label">Topic mastery</span>
          {!stats?.topics.length && <p className="muted">Complete a session and your strengths will show up here.</p>}
          <div className="stack">
            {stats?.topics.sort((a, b) => a.score - b.score).map((t) => (
              <div key={t.topic}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span>{topicName(topics, t.topic)}</span><span className="mono muted">{t.score}%</span>
                </div>
                <div className={`bar ${t.score < 50 ? 'low' : ''}`}><i style={{ width: `${t.score}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <span className="label">Recent interviews</span>
          {!stats?.recent.length && <p className="muted">No interviews yet. Your first one is a few clicks away.</p>}
          <div className="stack" style={{ gap: 10 }}>
            {stats?.recent.map((r) => (
              <div key={r.id} className="row between" style={{ cursor: 'pointer' }} onClick={() => nav(`/report/${r.id}`)}>
                <div>
                  <div>{r.topics.map((t) => topicName(topics, t)).join(', ') || 'Mixed'}</div>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>{new Date(r.at).toLocaleString()} · {r.level}</div>
                </div>
                <span className={`tag ${scoreClass(r.overall)}`}>{r.overall}/100</span>
              </div>
            ))}
          </div>
          {!!stats?.weakest.length && (
            <button className="btn sm" style={{ marginTop: 18 }} onClick={() => nav('/interview', { state: { topics: stats.weakest.map((w) => w.topic) } })}>
              Drill my weakest topics
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

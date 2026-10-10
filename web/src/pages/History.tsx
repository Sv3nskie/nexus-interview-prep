import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Session } from '../lib/api';
import { scoreClass, topicName, useTopics } from '../components/ui';

type Row = Omit<Session, 'turns'> & { turns: number };

export default function History() {
  const topics = useTopics();
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { api.listInterviews().then(setRows); }, []);

  return (
    <div className="fade stack" style={{ gap: 20 }}>
      <div className="page-head"><div><h1>Session <span className="grad">history</span></h1><p>Revisit any interview, its feedback and your study plan.</p></div></div>
      {rows && !rows.length && <div className="card muted">Nothing here yet.</div>}
      <div className="stack" style={{ gap: 10 }}>
        {rows?.map((r) => (
          <Link key={r.id} to={r.report ? `/report/${r.id}` : `/interview/${r.id}`} className="card row between action-card">
            <div>
              <div>{r.config.topics.map((t) => topicName(topics, t)).join(', ') || r.config.style}</div>
              <div className="muted" style={{ fontSize: '0.82rem' }}>{new Date(r.createdAt).toLocaleString()} · {r.level} · {r.turns} questions</div>
            </div>
            {r.report ? <span className={`tag ${scoreClass(r.report.overall)}`}>{r.report.overall}/100</span> : <span className="tag warn">unfinished — resume</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

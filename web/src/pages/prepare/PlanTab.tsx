import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { prep, type Plan, type PlanTask, type Profile } from '../../lib/api';
import { DatePicker, ErrorBox, Field, Loader, Segmented, topicName, useTopics, ymd } from '../../components/ui';

const LEVELS = ['junior', 'mid', 'senior', 'staff'] as const;
const LAB_LANG: Record<string, string> = { javascript: 'javascript', rust: 'rust', database: 'sql' };
const ICON: Record<PlanTask['type'], string> = { learn: '📘', flashcards: '🗂', quiz: '❓', lab: '⌨', interview: '🎙', leetcode: '🧩', review: '🔁' };

export default function PlanTab({ profile, onProfile, go }: { profile: Profile; onProfile: (p: Profile) => void; go: (t: string, e?: Record<string, string>) => void }) {
  const nav = useNavigate();
  const topics = useTopics();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [form, setForm] = useState({ interviewDate: profile.interviewDate, hoursPerDay: profile.hoursPerDay, level: profile.level as (typeof LEVELS)[number], role: profile.role });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => { prep.plan().then(setPlan).catch((e) => setErr(e.message)); }, []);

  const make = async () => {
    setBusy(true); setErr('');
    try {
      const p = await prep.makePlan({ ...form, focus: profile.focus });
      setPlan(p); setEditing(false);
      onProfile(await prep.profile());
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  const toggle = async (t: PlanTask) => {
    if (!plan) return;
    const done = !plan.done[t.id];
    setPlan({ ...plan, done: { ...plan.done, [t.id]: done } });
    prep.progress(t.id, done);
  };

  const start = (t: PlanTask) => {
    const first = t.topic.split(',')[0];
    switch (t.type) {
      case 'learn': case 'review': return go('learn', { topic: first, ...(t.module ? { module: t.module } : {}) });
      case 'flashcards': return go('cards', { topic: first });
      case 'leetcode': return go('leetcode', { kind: t.lc ?? '' });
      case 'quiz': return nav('/quiz', { state: { topics: [first] } });
      case 'lab': return nav('/lab', { state: { topic: first, language: LAB_LANG[first] ?? 'javascript' } });
      case 'interview': return nav('/interview', { state: { topics: t.topic.split(',') } });
    }
  };

  if (plan === undefined) return <Loader />;

  if (!plan || editing) {
    return (
      <div className="card glow stack" style={{ gap: 22, maxWidth: 820 }}>
        <h2>{plan ? 'Rebuild your plan' : 'Build your plan'}</h2>
        <p className="muted">Focus: {profile.focus.map((t) => topicName(topics, t)).join(', ')}. Weaker topics (from your interview/quiz scores) get more time; the last two days are mock interview and light review.</p>
        <div className="row" style={{ gap: 28, alignItems: 'flex-end' }}>
          <Field label="Interview date"><DatePicker value={form.interviewDate} onChange={(interviewDate) => setForm({ ...form, interviewDate })} /></Field>
          <Field label={`Hours per day: ${form.hoursPerDay}`}><input type="range" min={0.5} max={6} step={0.5} value={form.hoursPerDay} onChange={(e) => setForm({ ...form, hoursPerDay: +e.target.value })} /></Field>
          <Field label="Level"><Segmented options={LEVELS} value={form.level} onChange={(level) => setForm({ ...form, level })} /></Field>
        </div>
        <Field label="Target role"><input type="text" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></Field>
        {!form.interviewDate && <p className="muted" style={{ fontSize: '0.85rem' }}>No date set: you'll get a 14-day plan.</p>}
        <ErrorBox msg={err} />
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={make}>{busy ? 'Building…' : 'Generate plan →'}</button>
          {plan && <button className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>}
          {busy && <Loader label="mapping your syllabus onto the calendar" />}
        </div>
      </div>
    );
  }

  const today = ymd(new Date());
  const all = plan.days.flatMap((d) => d.tasks);
  const done = all.filter((t) => plan.done[t.id]).length;
  const minutes = (d: Plan['days'][number]) => d.tasks.reduce((a, t) => a + t.minutes, 0);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card row between">
        <div>
          <span className="label">Progress</span>
          <div className="row"><b style={{ fontSize: '1.6rem' }}>{done}/{all.length}</b><span className="muted">tasks done · {plan.days.length} days{plan.interviewDate ? ` · interview ${new Date(plan.interviewDate + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</span></div>
        </div>
        <div style={{ flex: 1, minWidth: 180, maxWidth: 360 }}><div className="bar"><i style={{ width: `${(done / Math.max(1, all.length)) * 100}%` }} /></div></div>
        <button className="btn sm" onClick={() => setEditing(true)}>Rebuild plan</button>
      </div>
      {plan.truncated && <div className="err" style={{ borderColor: 'var(--warn)', color: 'var(--warn)', background: 'rgba(251,191,36,0.07)' }}>Your interview is more than 6 weeks away: this shows the next 6 weeks. Rebuild it later to cover the final stretch.</div>}

      {plan.days.map((d) => {
        const isToday = d.date === today;
        const complete = d.tasks.every((t) => plan.done[t.id]);
        return (
          <details key={d.day} className="card qa" open={isToday || (!complete && d.date > today && d.day <= 2)} style={isToday ? { borderColor: 'var(--cyan)' } : undefined}>
            <summary style={{ padding: 0 }}>
              <span className={`tag ${complete ? 'good' : isToday ? '' : 'v'}`}>Day {d.day}</span>
              <span style={{ flex: 1 }}>{d.theme}</span>
              <span className="muted mono" style={{ fontSize: '0.8rem' }}>{new Date(d.date + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {minutes(d)}m {isToday && '· today'}</span>
            </summary>
            <div className="stack" style={{ gap: 8, marginTop: 14 }}>
              {d.tasks.map((t) => (
                <div key={t.id} className="row between" style={{ padding: '8px 10px', borderRadius: 12, background: 'rgba(0,0,0,0.25)', opacity: plan.done[t.id] ? 0.5 : 1 }}>
                  <label className="row" style={{ gap: 12, cursor: 'pointer', flex: 1 }}>
                    <input type="checkbox" checked={!!plan.done[t.id]} onChange={() => toggle(t)} style={{ accentColor: 'var(--cyan)', width: 18, height: 18 }} />
                    <span>{ICON[t.type]}</span>
                    <span style={{ textDecoration: plan.done[t.id] ? 'line-through' : 'none' }}>{t.title}</span>
                    <span className="tag">{t.type === 'interview' && t.topic.includes(',') ? 'mixed' : topicName(topics, t.topic.split(',')[0])}</span>
                  </label>
                  <span className="muted mono" style={{ fontSize: '0.8rem' }}>{t.minutes}m</span>
                  <button className="btn sm" onClick={() => start(t)}>Start →</button>
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

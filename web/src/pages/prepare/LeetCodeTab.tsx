import { useEffect, useState } from 'react';
import { prep, type LcProblem, type LeetCode, type Profile } from '../../lib/api';
import { ErrorBox, Loader } from '../../components/ui';

const DIFF_TAG: Record<string, string> = { Easy: 'good', Medium: 'warn', Hard: 'bad' };
const SETS = [['javascript', 'JavaScript set (30 Days of JS style)'], ['database', 'SQL / Database set']] as const;

export default function LeetCodeTab({ profile, onProfile, initialKind }: { profile: Profile; onProfile: (p: Profile) => void; initialKind: string | null }) {
  const [user, setUser] = useState(profile.leetcodeUser);
  const [data, setData] = useState<LeetCode | null | undefined>(undefined);
  const [kind, setKind] = useState(initialKind ?? '');
  const [diff, setDiff] = useState('');
  const [problems, setProblems] = useState<LcProblem[] | null>(null);
  const [busy, setBusy] = useState<'' | 'sync' | 'rec'>('');
  const [err, setErr] = useState('');

  useEffect(() => { prep.lc().then(setData).catch(() => setData(null)); }, []);

  const recommend = async (k: string, d = diff) => {
    if (!k) return;
    setKind(k); setBusy('rec'); setErr('');
    try { setProblems((await prep.lcRecommend(k, d || undefined)).problems); } catch (e) { setErr((e as Error).message); }
    setBusy('');
  };
  useEffect(() => { if (initialKind) recommend(initialKind); }, []); // eslint-disable-line

  const sync = async () => {
    setBusy('sync'); setErr('');
    try { setData(await prep.lcSync(user)); onProfile(await prep.profile()); } catch (e) { setErr((e as Error).message); }
    setBusy('');
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="card stack">
        <span className="label">Connect your LeetCode</span>
        <div className="row">
          <input type="text" value={user} onChange={(e) => setUser(e.target.value)} placeholder="your LeetCode username" style={{ maxWidth: 300 }} onKeyDown={(e) => e.key === 'Enter' && sync()} />
          <button className="btn primary" disabled={!user.trim() || busy === 'sync'} onClick={sync}>{busy === 'sync' ? 'Fetching…' : data ? 'Refresh' : 'Pull my stats'}</button>
        </div>
        <p className="muted" style={{ fontSize: '0.85rem' }}>Reads only your <b>public</b> profile (solved counts, topic tags, recent accepted solutions). No password or cookie needed, and nothing is posted back. Your profile must be public.</p>
        <ErrorBox msg={err} />
      </div>

      {data && (
        <div className="grid g2">
          <div className="card stack">
            <div className="row between"><span className="label" style={{ margin: 0 }}>{data.username}</span>{data.ranking && <span className="tag v">rank #{data.ranking.toLocaleString()}</span>}</div>
            <div className="grid g4">
              {([['Total', data.solved.total, ''], ['Easy', data.solved.easy, 'good'], ['Medium', data.solved.medium, 'warn'], ['Hard', data.solved.hard, 'bad']] as const).map(([k, v, c]) => (
                <div key={k} className="stat"><div className={`num ${c ? '' : 'grad'}`} style={c ? { color: `var(--${c})` } : undefined}>{v}</div><div className="cap">{k}</div></div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: '0.85rem' }}>{data.solved.medium < 40 ? 'Interviews are mostly Mediums: build up past ~40–60 before the test.' : 'Solid Medium volume. Prioritise your weakest tags and timed practice.'}</p>
          </div>
          <div className="card stack">
            <span className="label" style={{ margin: 0 }}>Core patterns (target = comfortable level)</span>
            <div className="stack" style={{ gap: 9 }}>
              {[...data.core].sort((a, b) => a.pct - b.pct).map((c) => (
                <div key={c.slug} style={{ cursor: 'pointer' }} onClick={() => recommend(c.slug)}>
                  <div className="row between" style={{ marginBottom: 4, fontSize: '0.88rem' }}>
                    <span>{c.name}{data.weakTags.includes(c.slug) && <span className="tag bad" style={{ marginLeft: 8 }}>weak</span>}</span>
                    <span className="mono muted">{c.solved}/{c.target}</span>
                  </div>
                  <div className={`bar ${c.pct < 50 ? 'low' : ''}`}><i style={{ width: `${c.pct}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card stack">
        <div className="row between">
          <span className="label" style={{ margin: 0 }}>Recommended problems</span>
          <div className="seg">{['', 'easy', 'medium', 'hard'].map((d) => <button key={d} className={diff === d ? 'on' : ''} onClick={() => { setDiff(d); recommend(kind, d); }}>{d || 'any'}</button>)}</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {SETS.map(([k, name]) => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => recommend(k)}>{name}</button>)}
          {data?.weakTags.map((t) => <button key={t} className={`chip ${kind === t ? 'on' : ''}`} onClick={() => recommend(t)}>{t.replace(/-/g, ' ')}</button>)}
          {!data && <span className="muted" style={{ fontSize: '0.85rem' }}>Connect your profile to see problems for your weakest patterns.</span>}
        </div>
        {busy === 'rec' && <Loader label="finding problems" />}
        {!kind && !problems && <p className="muted">Pick a set above. Problems you solved recently are filtered out.</p>}
        <div className="stack" style={{ gap: 8 }}>
          {problems?.map((p) => (
            <a key={p.titleSlug} href={p.url} target="_blank" rel="noreferrer" className="row between" style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)' }}>
              <span>{p.title}</span>
              <span className="row"><span className="muted mono" style={{ fontSize: '0.8rem' }}>{p.acRate.toFixed(0)}% acc</span><span className={`tag ${DIFF_TAG[p.difficulty]}`}>{p.difficulty}</span><span className="muted">↗</span></span>
            </a>
          ))}
          {problems && !problems.length && <p className="muted">Nothing new in that slice. Try another difficulty.</p>}
        </div>
        {problems && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => recommend(kind)}>Shuffle</button>}
      </div>
    </div>
  );
}

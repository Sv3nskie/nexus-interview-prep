import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { prep, type Profile } from '../lib/api';
import { useTopics } from '../components/ui';
import PlanTab from './prepare/PlanTab';
import LearnTab from './prepare/LearnTab';
import CardsTab from './prepare/CardsTab';
import LeetCodeTab from './prepare/LeetCodeTab';

const TABS = [
  ['plan', 'Study plan'], ['learn', 'Learn'], ['cards', 'Flashcards'], ['leetcode', 'LeetCode'],
] as const;

export default function Prepare() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'plan') as (typeof TABS)[number][0];
  const topics = useTopics();
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => { prep.profile().then(setProfile); }, []);

  const go = (t: string, extra: Record<string, string> = {}) => setParams({ tab: t, ...extra });
  const focus = profile?.focus ?? [];

  const saveFocus = async (next: string[]) => {
    if (!next.length) return;
    setProfile(await prep.saveProfile({ focus: next }));
  };

  return (
    <div className="fade stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>Prepare <span className="grad">before the test</span></h1>
          <p>A day-by-day plan, deep lessons, spaced-repetition flashcards and LeetCode targets for your focus areas.</p>
        </div>
      </div>

      <div className="card row between" style={{ padding: '14px 18px' }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="label" style={{ margin: 0 }}>Focus</span>
          {topics.filter((t) => !['behavioral', 'system-design'].includes(t.id)).map((t) => (
            <button key={t.id} className={`chip ${focus.includes(t.id) ? 'on' : ''}`}
              onClick={() => saveFocus(focus.includes(t.id) ? focus.filter((x) => x !== t.id) : [...focus, t.id])}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        {TABS.map(([id, name]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => go(id)}>{name}</button>)}
      </div>

      {profile && tab === 'plan' && <PlanTab profile={profile} onProfile={setProfile} go={go} />}
      {profile && tab === 'learn' && <LearnTab focus={focus} initialTopic={params.get('topic')} initialModule={params.get('module')} go={go} />}
      {profile && tab === 'cards' && <CardsTab focus={focus} initialTopic={params.get('topic')} />}
      {profile && tab === 'leetcode' && <LeetCodeTab profile={profile} onProfile={setProfile} initialKind={params.get('kind')} />}
    </div>
  );
}

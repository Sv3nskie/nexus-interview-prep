import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { chat, chatJson } from './ai.js';
import { CORE_TAGS, CURRICULUM, LC_CATEGORY, type Module } from './curriculum.js';
import { topicScores } from './routes.js';
import { db, save, type Card } from './store.js';
import { topicById } from './topics.js';

export const prepare = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const DAY = 864e5;
const label = (id: string) => topicById(id)?.label ?? id;
const key = (...p: string[]) => p.join('|');
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // local, not UTC

// ───────────────────────── profile ─────────────────────────

prepare.get('/profile', (_req, res) => res.json(db.profile));
function applyProfile(b: any) {
  const p = db.profile;
  if (typeof b.role === 'string') p.role = b.role.slice(0, 80);
  if (['junior', 'mid', 'senior', 'staff'].includes(b.level)) p.level = b.level;
  if (typeof b.interviewDate === 'string') p.interviewDate = b.interviewDate;
  if (Number.isFinite(+b.hoursPerDay)) p.hoursPerDay = Math.min(8, Math.max(0.5, +b.hoursPerDay));
  if (Array.isArray(b.focus)) p.focus = b.focus.filter((t: string) => topicById(t)).slice(0, 8);
  if (typeof b.leetcodeUser === 'string') p.leetcodeUser = b.leetcodeUser.trim().slice(0, 40);
  save();
  return p;
}
prepare.put('/profile', (req, res) => res.json(applyProfile(req.body ?? {})));

// ───────────────────────── learn ─────────────────────────

async function modulesFor(topic: string): Promise<Module[]> {
  if (CURRICULUM[topic]) return CURRICULUM[topic];
  const k = key(topic, db.profile.level);
  if (!db.outlines[k]) {
    const t = topicById(topic);
    const out = await chatJson<{ modules: Module[] }>([
      { role: 'system', content: 'You are a curriculum designer for software engineering interview preparation.' },
      { role: 'user', content: `Design an ordered syllabus of 12 to 14 modules to prepare a ${db.profile.level} candidate for ${t?.label ?? topic} interviews (areas: ${t?.focus ?? ''}). Order from foundations to advanced. Reply as JSON: {"modules":[{"title":"...","summary":"one sentence"}]}` },
    ], { temperature: 0.4 });
    db.outlines[k] = (out.modules ?? []).filter((m) => m.title).slice(0, 16);
    save();
  }
  return db.outlines[k];
}

prepare.get('/curriculum/:topic', wrap(async (req, res) => {
  const topic = req.params.topic;
  if (!topicById(topic)) return res.status(404).json({ error: 'Unknown topic' });
  const modules = await modulesFor(topic);
  res.json({
    topic,
    modules: modules.map((m) => {
      const l = db.lessons[key(topic, m.title)];
      return { ...m, cached: !!l, done: !!l?.done };
    }),
  });
}));

const CODE_LANG: Record<string, string> = { javascript: 'JavaScript', rust: 'Rust', database: 'SQL (PostgreSQL flavour, mention MySQL differences where they matter) and MongoDB where relevant', nodejs: 'JavaScript', react: 'JSX/TypeScript', dart: 'Dart', flutter: 'Dart', backend: 'JavaScript or Python', frontend: 'JavaScript' };

prepare.post('/lesson', wrap(async (req, res) => {
  const { topic, title, refresh } = req.body ?? {};
  if (!topicById(topic) || typeof title !== 'string') return res.status(400).json({ error: 'topic and title required' });
  const k = key(topic, title);
  const cached = db.lessons[k];
  if (cached && !refresh) return res.json(cached);

  const mod = (await modulesFor(topic)).find((m) => m.title === title);
  const markdown = await chat([
    { role: 'system', content: 'You are an expert engineer and teacher writing a focused study lesson for someone about to sit a software engineering interview. Be precise, concrete, and free of fluff. Use GitHub-flavoured markdown.' },
    {
      role: 'user',
      content: `Topic: ${label(topic)}. Module: "${title}"${mod ? ` — ${mod.summary}` : ''}.
Reader level: ${db.profile.level}. Code language: ${CODE_LANG[topic] ?? 'the most relevant language'}.

Write the lesson with exactly these sections (## headings):
## Why interviewers ask this
2-3 sentences: what they are really testing.
## Core ideas
The mental model in tight bullets or short paragraphs. Include a small table or diagram in text if it clarifies.
## Worked examples
2-3 runnable code examples with comments; show output where useful. Keep each under 25 lines.
## Questions you will get
5 likely interview questions, each followed by a 2-3 sentence model answer.
## Traps & gotchas
Common mistakes and what a strong candidate says instead.
## Check yourself
3 short self-test questions (answers hidden at the end under "Answers:").
Do not add any preamble or closing remarks.`,
    },
  ], { temperature: 0.5 });

  db.lessons[k] = { markdown: markdown.trim(), at: Date.now(), done: cached?.done };
  save();
  res.json(db.lessons[k]);
}));

prepare.post('/lesson/done', (req, res) => {
  const { topic, title, done = true } = req.body ?? {};
  const l = db.lessons[key(topic, title)];
  if (l) { l.done = !!done; save(); }
  res.json({ ok: !!l });
});

// ───────────────────────── flashcards (spaced repetition) ─────────────────────────

prepare.get('/decks', (_req, res) => {
  const now = Date.now();
  res.json(Object.entries(db.decks).map(([topic, cards]) => ({ topic, total: cards.length, due: cards.filter((c) => c.due <= now).length })));
});

prepare.post('/decks/generate', wrap(async (req, res) => {
  const { topic, module, count = 10 } = req.body ?? {};
  if (!topicById(topic)) return res.status(400).json({ error: 'Unknown topic' });
  const deck = (db.decks[topic] ??= []);
  const n = Math.min(20, Math.max(3, Math.round(+count) || 10));
  const t = topicById(topic)!;
  const out = await chatJson<{ cards: { front: string; back: string }[] }>([
    { role: 'system', content: 'You write high-quality spaced-repetition flashcards for software interview prep. Each card tests exactly one fact or idea; the front is a question or prompt, the back is a crisp answer (max 50 words, code inline if needed).' },
    {
      role: 'user',
      content: `Topic: ${t.label}${module ? `, module: ${module}` : ` (areas: ${t.focus})`}. Level: ${db.profile.level}.
Write ${n} NEW cards. Mix definitions, "what is the output / what happens", trade-offs, and "when would you use X over Y".
Do not duplicate these existing cards:\n${deck.slice(-30).map((c) => `- ${c.front}`).join('\n') || '(none)'}
Reply as JSON: {"cards":[{"front":"...","back":"..."}]}`,
    },
  ], { temperature: 0.8 });
  const seen = new Set(deck.map((c) => c.front.toLowerCase()));
  const fresh: Card[] = (out.cards ?? [])
    .filter((c) => c.front && c.back && !seen.has(c.front.toLowerCase()))
    .map((c) => ({ id: randomUUID(), front: c.front, back: c.back, ease: 2.5, interval: 0, due: Date.now(), reps: 0 }));
  deck.push(...fresh);
  save();
  res.json({ added: fresh.length, total: deck.length });
}));

prepare.get('/decks/:topic/due', (req, res) => {
  const now = Date.now();
  const deck = db.decks[req.params.topic] ?? [];
  res.json({ total: deck.length, cards: deck.filter((c) => c.due <= now).sort((a, b) => a.due - b.due).slice(0, 25) });
});

prepare.post('/decks/:topic/review', (req, res) => {
  const card = (db.decks[req.params.topic] ?? []).find((c) => c.id === req.body?.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  const grade = Math.min(3, Math.max(0, Math.round(+req.body?.grade))); // 0 again · 1 hard · 2 good · 3 easy
  if (grade === 0) { card.reps = 0; card.interval = 0; card.ease = Math.max(1.3, card.ease - 0.2); card.due = Date.now() + 10 * 60_000; }
  else {
    if (grade === 1) { card.interval = Math.max(1, Math.round(card.interval * 1.2)); card.ease = Math.max(1.3, card.ease - 0.15); }
    else if (grade === 2) card.interval = card.reps === 0 ? 1 : card.reps === 1 ? 3 : Math.round(card.interval * card.ease);
    else { card.interval = card.reps === 0 ? 3 : Math.round(card.interval * card.ease * 1.3); card.ease += 0.15; }
    card.reps++;
    card.due = Date.now() + card.interval * DAY;
  }
  save();
  res.json(card);
});

// ───────────────────────── LeetCode (public profile data only, no login) ─────────────────────────

async function lcQuery<T>(query: string, variables: object): Promise<T> {
  const r = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`LeetCode responded ${r.status}`);
  const j = (await r.json()) as { data?: T; errors?: { message: string }[] };
  if (!j.data) throw new Error(j.errors?.[0]?.message ?? 'LeetCode returned no data');
  return j.data;
}

prepare.post('/leetcode/sync', wrap(async (req, res) => {
  const username = String(req.body?.username ?? db.profile.leetcodeUser ?? '').trim();
  if (!/^[\w.-]{1,40}$/.test(username)) return res.status(400).json({ error: 'Enter your LeetCode username' });
  const d = await lcQuery<any>(
    `query u($username:String!){ matchedUser(username:$username){ username profile{ranking}
      submitStatsGlobal{acSubmissionNum{difficulty count}}
      tagProblemCounts{advanced{tagName tagSlug problemsSolved} intermediate{tagName tagSlug problemsSolved} fundamental{tagName tagSlug problemsSolved}} }
      recentAcSubmissionList(username:$username, limit:20){ title titleSlug timestamp } }`,
    { username },
  );
  const u = d.matchedUser;
  if (!u) return res.status(404).json({ error: `No public LeetCode profile named "${username}"` });

  const counts = Object.fromEntries(u.submitStatsGlobal.acSubmissionNum.map((x: any) => [x.difficulty.toLowerCase(), x.count]));
  const tags: Record<string, { name: string; solved: number }> = {};
  for (const lvl of ['fundamental', 'intermediate', 'advanced']) for (const t of u.tagProblemCounts[lvl] ?? []) tags[t.tagSlug] = { name: t.tagName, solved: t.problemsSolved };
  const core = CORE_TAGS.map((c) => ({ ...c, solved: tags[c.slug]?.solved ?? 0 })).map((c) => ({ ...c, pct: Math.min(100, Math.round((c.solved / c.target) * 100)) }));

  db.leetcode = {
    username: u.username, fetchedAt: Date.now(), ranking: u.profile?.ranking ?? null,
    solved: { total: counts.all ?? 0, easy: counts.easy ?? 0, medium: counts.medium ?? 0, hard: counts.hard ?? 0 },
    core, weakTags: [...core].sort((a, b) => a.pct - b.pct).slice(0, 5).map((c) => c.slug),
    recent: d.recentAcSubmissionList ?? [],
  };
  db.profile.leetcodeUser = u.username;
  save();
  res.json(db.leetcode);
}));

prepare.get('/leetcode', (_req, res) => res.json(db.leetcode));

prepare.get('/leetcode/recommend', wrap(async (req, res) => {
  const kind = String(req.query.kind ?? '');
  const difficulty = ['EASY', 'MEDIUM', 'HARD'].includes(String(req.query.difficulty).toUpperCase()) ? String(req.query.difficulty).toUpperCase() : undefined;
  if (!/^[a-z0-9-]{1,40}$/.test(kind)) return res.status(400).json({ error: 'bad kind' });
  const category = LC_CATEGORY[kind] ?? '';
  const filters: Record<string, unknown> = { ...(category ? {} : { tags: [kind] }), ...(difficulty ? { difficulty } : {}) };
  const Q = `query p($c:String,$l:Int,$s:Int,$f:QuestionListFilterInput){ questionList(categorySlug:$c,limit:$l,skip:$s,filters:$f){ total: totalNum data{ title titleSlug difficulty acRate isPaidOnly } } }`;
  const head = await lcQuery<any>(Q, { c: category, l: 1, s: 0, f: filters });
  const total = head.questionList.total as number;
  const skip = Math.floor(Math.random() * Math.max(1, total - 60));
  const page = await lcQuery<any>(Q, { c: category, l: 60, s: skip, f: filters });
  const done = new Set<string>((db.leetcode?.recent ?? []).map((r: any) => r.titleSlug));
  const pool = (page.questionList.data as any[]).filter((q) => !q.isPaidOnly && !done.has(q.titleSlug));
  const picked = pool.map((q) => [Math.random(), q] as const).sort((a, b) => a[0] - b[0]).slice(0, 6).map((x) => x[1]);
  res.json({ total, problems: picked.map((q) => ({ ...q, url: `https://leetcode.com/problems/${q.titleSlug}/` })) });
}));

// ───────────────────────── study plan ─────────────────────────

interface Task { id: string; type: 'learn' | 'flashcards' | 'quiz' | 'lab' | 'interview' | 'leetcode' | 'review'; topic: string; title: string; minutes: number; module?: string; lc?: string }

prepare.post('/plan', wrap(async (req, res) => {
  const p = applyProfile(req.body ?? {});
  const focus = p.focus.length ? p.focus : ['javascript', 'rust', 'database'];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = p.interviewDate ? new Date(p.interviewDate + 'T00:00:00') : null;
  const left = target ? Math.ceil((+target - +today) / DAY) : 14;
  const days = Math.min(Math.max(left, 1), 42);

  // weaker topics get more turns; unassessed topics count as "unknown" (50)
  const scores = Object.fromEntries(topicScores().map((t) => [t.topic, t.score]));
  const ordered = [...focus].sort((a, b) => (scores[a] ?? 50) - (scores[b] ?? 50));
  const mods: Record<string, Module[]> = {};
  for (const t of ordered) mods[t] = await modulesFor(t);

  const queue: { topic: string; m: Module }[] = [];
  const cursor: Record<string, number> = Object.fromEntries(ordered.map((t) => [t, 0]));
  for (let round = 0; ordered.some((t) => cursor[t] < mods[t].length); round++) {
    for (const t of ordered) {
      const turns = (scores[t] ?? 50) < 50 && round % 2 === 0 ? 2 : 1;
      for (let i = 0; i < turns && cursor[t] < mods[t].length; i++) queue.push({ topic: t, m: mods[t][cursor[t]++] });
    }
  }

  const lcWeak: string[] = db.leetcode?.weakTags ?? ['array', 'hash-table', 'two-pointers'];
  const budget = Math.round(p.hoursPerDay * 60);
  const plan: { day: number; date: string; theme: string; tasks: Task[] }[] = [];
  let qi = 0, lcRot = 0, pracRot = 0;
  for (let d = 1; d <= days; d++) {
    const date = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + d - 1));
    const tasks: Task[] = [];
    let used = 0;
    const add = (t: Omit<Task, 'id'>) => { tasks.push({ ...t, id: `d${d}-${tasks.length}` }); used += t.minutes; };
    const final = d === days && days > 2;
    const eve = d === days - 1 && days > 3;

    if (final) {
      add({ type: 'flashcards', topic: ordered[0], title: 'Light review: due flashcards only', minutes: 20 });
      add({ type: 'quiz', topic: ordered[0], title: 'Confidence quiz: stop early, then rest', minutes: 15 });
    } else if (eve) {
      add({ type: 'interview', topic: ordered.join(','), title: 'Full mock interview: all focus topics', minutes: 45 });
      add({ type: 'review', topic: ordered[0], title: 'Read the report and fix your two weakest answers', minutes: 30 });
    } else {
      let learned: string | null = null;
      while (qi < queue.length && used + 30 <= Math.max(budget, 40) && tasks.filter((t) => t.type === 'learn').length < (budget >= 150 ? 2 : 1)) {
        const { topic, m } = queue[qi++];
        add({ type: 'learn', topic, module: m.title, title: m.title, minutes: 30 });
        learned = topic;
      }
      if (learned) add({ type: 'flashcards', topic: learned, title: `Flashcards: ${label(learned)}`, minutes: 10 });
      const topic = ordered[pracRot++ % ordered.length];
      const slot = d % 4;
      if (used + 25 <= budget || !tasks.length) {
        if (slot === 0) add({ type: 'quiz', topic, title: `Quiz: ${label(topic)}`, minutes: 15 });
        else if (slot === 1) add({ type: 'lab', topic, title: `Code Lab: ${label(topic)}`, minutes: 30 });
        else if (slot === 2) { const tag = lcWeak[lcRot++ % lcWeak.length]; add({ type: 'leetcode', topic, lc: tag, title: `LeetCode: 2 problems tagged ${tag.replace(/-/g, ' ')}`, minutes: 40 }); }
        else add({ type: 'interview', topic, title: `Mock interview: ${label(topic)}`, minutes: 25 });
      }
      if (qi >= queue.length && !learned) add({ type: 'review', topic: ordered[d % ordered.length], title: 'Revisit a weak lesson and re-do its self-check', minutes: 30 });
    }
    plan.push({ day: d, date, theme: tasks.find((t) => t.type === 'learn')?.title ?? (final ? 'Rest & light review' : eve ? 'Dress rehearsal' : 'Practice'), tasks });
  }

  db.plan = { createdAt: Date.now(), interviewDate: p.interviewDate, focus, daysLeft: left, truncated: left > 42, days: plan, done: {} };
  save();
  res.json(db.plan);
}));

prepare.get('/plan', (_req, res) => res.json(db.plan));
prepare.put('/plan/progress', (req, res) => {
  if (!db.plan) return res.status(404).json({ error: 'No plan' });
  const { id, done } = req.body ?? {};
  if (typeof id === 'string') { if (done) db.plan.done[id] = true; else delete db.plan.done[id]; save(); }
  res.json(db.plan.done);
});

import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { chatJson, health } from './ai.js';
import { db, remember, save } from './store.js';
import { ANGLES, LEVELS, TOPICS, pick, shuffle, topicById } from './topics.js';

export const api = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);

const clamp = (n: unknown, lo: number, hi: number, d = lo) => Math.min(hi, Math.max(lo, Number.isFinite(+n!) ? Math.round(+n!) : d));
const topicLabel = (id: string) => topicById(id)?.label ?? id;
const recentFor = (topic: string, n = 12) => (db.asked[topic] ?? []).slice(-n);

const INTERVIEWER = `You are a sharp, fair, senior engineer running a real software-engineering job interview.
Be concrete and specific. Never ask generic trivia that has an obvious textbook one-liner answer.
Ask ONE question at a time, phrased the way a human interviewer speaks (no markdown, no numbering, under 60 words).
Calibrate difficulty strictly to the candidate level.
Prefer realistic, practical situations an engineer actually meets at work. Test ONE concept deeply rather than stacking many advanced buzzwords into one question. The question must be coherent and technically sound.`;

// ───────────────────────── config / settings ─────────────────────────

api.get('/config', (_req, res) => res.json({ topics: TOPICS, levels: LEVELS }));
api.get('/health', wrap(async (_req, res) => res.json(await health())));
api.put('/settings', (req, res) => {
  const { provider, ollamaModel, claudeModel } = req.body ?? {};
  if (['ollama', 'claude', 'openai'].includes(provider)) db.settings.provider = provider;
  if (typeof ollamaModel === 'string') db.settings.ollamaModel = ollamaModel;
  if (typeof claudeModel === 'string') db.settings.claudeModel = claudeModel;
  save();
  res.json(db.settings);
});

// ───────────────────────── interviews ─────────────────────────

interface Slot { topic: string; angle: string; kind: 'technical' | 'behavioral' | 'system-design' }
interface Turn { question: string; topic: string; kind: string; followUp: 'gap' | 'harder' | null; answer?: string; metrics?: any; evaluation?: any }

function planSlots(topics: string[], style: string, count: number): Slot[] {
  const order = shuffle(topics.length ? topics : ['javascript']);
  return Array.from({ length: count }, (_, i) => {
    let topic = order[i % order.length];
    let kind: Slot['kind'] = 'technical';
    if (style === 'behavioral') { kind = 'behavioral'; topic = 'behavioral'; }
    else if (style === 'system-design') { kind = 'system-design'; topic = 'system-design'; }
    else if (style === 'mixed' && i % 4 === 3) { kind = 'behavioral'; topic = 'behavioral'; }
    else if (topic === 'behavioral') kind = 'behavioral';
    else if (topic === 'system-design') kind = 'system-design';
    return { topic, angle: kind === 'technical' ? pick(ANGLES) : 'any', kind };
  });
}

function kindGuide(kind: string) {
  if (kind === 'behavioral') return 'a behavioral question that elicits a specific past experience (STAR). Vary the competency (conflict, failure, ownership, ambiguity, mentoring, deadlines).';
  if (kind === 'system-design') return 'a system design prompt scoped to be discussable in ~10 minutes, with one or two concrete constraints (scale, latency, consistency).';
  return 'a technical question that tests understanding and judgement, answerable verbally in 1-3 minutes.';
}

async function generateQuestion(s: any, slot: Slot): Promise<Turn> {
  const t = topicById(slot.topic);
  const avoid = [...recentFor(slot.topic), ...s.turns.map((x: Turn) => x.question)];
  const out = await chatJson<{ question: string }>([
    { role: 'system', content: INTERVIEWER },
    {
      role: 'user',
      content: `Candidate level: ${s.level}.
Topic: ${t?.label ?? slot.topic}${t ? ` (areas: ${t.focus})` : ''}.
Angle to use: ${slot.angle}.
Write ${kindGuide(slot.kind)}
Do NOT repeat or paraphrase any of these earlier questions:
${avoid.map((q) => `- ${q}`).join('\n') || '(none)'}
Reply as JSON: {"question": "..."}`,
    },
  ], { temperature: 1 });
  remember(slot.topic, out.question);
  return { question: out.question, topic: slot.topic, kind: slot.kind, followUp: null };
}

const publicSession = (s: any) => ({
  id: s.id, config: s.config, level: s.level, status: s.status, createdAt: s.createdAt,
  slotIndex: s.slotIndex, total: s.slots.length, turns: s.turns, report: s.report ?? null,
});

api.post('/interviews', wrap(async (req, res) => {
  const { topics = [], level = 'mid', style = 'mixed', count = 5, input = 'text', video = false } = req.body ?? {};
  const valid = (topics as string[]).filter((t) => topicById(t));
  const n = clamp(count, 1, 15, 5);
  const s: any = {
    id: randomUUID(), createdAt: Date.now(), status: 'active', level: LEVELS.includes(level) ? level : 'mid',
    config: { topics: valid, style, count: n, input, video: !!video }, slotIndex: 0, turns: [] as Turn[],
  };
  s.slots = planSlots(valid, style, n);
  s.turns.push(await generateQuestion(s, s.slots[0]));
  db.interviews[s.id] = s;
  save();
  res.json(publicSession(s));
}));

api.post('/interviews/:id/answer', wrap(async (req, res) => {
  const s = db.interviews[req.params.id];
  if (!s || s.status !== 'active') return res.status(404).json({ error: 'No active interview' });
  const turn: Turn = s.turns[s.turns.length - 1];
  const answer = String(req.body?.answer ?? '').trim();
  if (!answer) return res.status(400).json({ error: 'Empty answer' });
  turn.answer = answer;
  turn.metrics = req.body?.metrics ?? null;

  // Decide what comes next BEFORE asking the model, so one call does both jobs.
  const slotsLeft = s.slots.length - (s.slotIndex + 1);
  const wantFollowUp = !turn.followUp; // never chain follow-ups
  const m = turn.metrics;
  const voiceNote = m?.source === 'voice'
    ? `\nSpoken delivery: ${m.wpm} words/min, ${m.fillers} filler words (um/uh/like/you know), ${m.durationSec}s. Include one short comment on delivery in "summary" if notable.`
    : '';
  const history = s.turns.slice(0, -1).filter((t: Turn) => t.evaluation)
    .map((t: Turn) => `Q: ${t.question}\nScore ${t.evaluation.score}/10`).join('\n').slice(-1200);

  const ev = await chatJson<{
    score: number; summary: string; strengths: string[]; gaps: string[]; modelAnswer: string;
    nextIfGap: string; nextIfHarder: string;
  }>([
    { role: 'system', content: INTERVIEWER + '\nYou are now also grading. Be honest: a vague or wrong answer deserves a low score. Do not flatter.' },
    {
      role: 'user',
      content: `Level: ${s.level}. Topic: ${topicLabel(turn.topic)}. Question type: ${turn.kind}.
Earlier in this interview:\n${history || '(first question)'}

QUESTION: ${turn.question}
CANDIDATE ANSWER: ${answer}${voiceNote}

Grade 0-10 against what a ${s.level} candidate should say. For behavioral answers, judge structure (situation, action, result), specificity and ownership.
Reply as JSON:
{
 "score": number,
 "summary": "2 sentences of direct feedback addressed to the candidate",
 "strengths": ["max 3 short items"],
 "gaps": ["max 3 short items - what was missing or wrong"],
 "modelAnswer": "a strong but concise answer (max 120 words)",
 "nextIfGap": "a short follow-up question probing the biggest gap in their answer",
 "nextIfHarder": "a follow-up that raises the difficulty with a twist or constraint"
}`,
    },
  ], { temperature: 0.4 });

  const score = clamp(ev.score, 0, 10);
  turn.evaluation = { score, summary: ev.summary, strengths: ev.strengths ?? [], gaps: ev.gaps ?? [], modelAnswer: ev.modelAnswer };

  let next: Turn | null = null;
  if (wantFollowUp && score <= 5 && ev.nextIfGap) next = { question: ev.nextIfGap, topic: turn.topic, kind: turn.kind, followUp: 'gap' };
  else if (wantFollowUp && score >= 9 && ev.nextIfHarder && Math.random() < 0.6) next = { question: ev.nextIfHarder, topic: turn.topic, kind: turn.kind, followUp: 'harder' };

  if (next) remember(turn.topic, next.question);
  else if (slotsLeft > 0) { s.slotIndex++; next = await generateQuestion(s, s.slots[s.slotIndex]); }

  if (next) s.turns.push(next); else s.status = 'finished';
  save();
  res.json({ evaluation: turn.evaluation, next, done: !next });
}));

api.post('/interviews/:id/finish', wrap(async (req, res) => {
  const s = db.interviews[req.params.id];
  if (!s) return res.status(404).json({ error: 'Not found' });
  if (s.report) return res.json(publicSession(s));
  const answered = (s.turns as Turn[]).filter((t) => t.evaluation);
  if (!answered.length) { delete db.interviews[s.id]; save(); return res.json({ discarded: true }); }

  const byTopic: Record<string, number[]> = {};
  answered.forEach((t) => (byTopic[t.topic] ??= []).push(t.evaluation.score));
  const topicScores = Object.entries(byTopic).map(([topic, v]) => ({ topic, score: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) }));
  const avg = answered.reduce((a, t) => a + t.evaluation.score, 0) / answered.length;

  const summary = await chatJson<{
    verdict: string; hireSignal: string; strengths: string[]; weaknesses: string[];
    communication: number; depth: number; studyPlan: { topic: string; why: string; practice: string }[];
  }>([
    { role: 'system', content: 'You are a hiring committee lead writing candid, constructive interview feedback.' },
    {
      role: 'user',
      content: `Level targeted: ${s.level}. Average question score ${avg.toFixed(1)}/10.
Transcript:
${answered.map((t, i) => `#${i + 1} [${topicLabel(t.topic)}] ${t.question}\nAnswer: ${(t.answer ?? '').slice(0, 500)}\nScore: ${t.evaluation.score}/10 — gaps: ${t.evaluation.gaps.join('; ')}`).join('\n\n').slice(0, 6000)}

Reply as JSON:
{"verdict": "3 sentence overall assessment", "hireSignal": "strong_no|no|lean_no|lean_yes|yes|strong_yes",
 "strengths": ["max 4"], "weaknesses": ["max 4"], "communication": 0-100, "depth": 0-100,
 "studyPlan": [{"topic": "...", "why": "...", "practice": "concrete exercise or reading"}] (3 to 5 items)}`,
    },
  ], { temperature: 0.3 });

  s.report = { overall: Math.round(avg * 10), topicScores, ...summary };
  s.status = 'finished';
  save();
  res.json(publicSession(s));
}));

api.get('/interviews/:id', (req, res) => {
  const s = db.interviews[req.params.id];
  s ? res.json(publicSession(s)) : res.status(404).json({ error: 'Not found' });
});

api.get('/interviews', (_req, res) => {
  const list = Object.values<any>(db.interviews).sort((a, b) => b.createdAt - a.createdAt).map(publicSession);
  res.json(list.map((s) => ({ ...s, turns: s.turns.length })));
});

// ───────────────────────── quiz ─────────────────────────

api.post('/quiz', wrap(async (req, res) => {
  const { topics = [], level = 'mid', count = 8 } = req.body ?? {};
  const ids: string[] = (topics as string[]).filter((t) => topicById(t));
  const pool = ids.length ? ids : ['javascript'];
  const n = clamp(count, 3, 15, 8);
  const plan = Array.from({ length: n }, (_, i) => ({ topic: pool[i % pool.length], angle: pick(ANGLES) }));
  const out = await chatJson<{ questions: { q: string; options: string[]; answerIndex: number; explanation: string; topic: string }[] }>([
    { role: 'system', content: 'You write tricky but fair multiple-choice questions for software engineering interviews. Exactly one option is correct; distractors must be plausible. Mix code-reading questions with concept questions.' },
    {
      role: 'user',
      content: `Candidate level: ${level}. Write ${n} questions, one per line of this plan (use the topic id in the "topic" field):
${plan.map((p, i) => `${i + 1}. topic=${p.topic} (${topicLabel(p.topic)}), angle=${p.angle}`).join('\n')}
Avoid these recent questions:\n${plan.flatMap((p) => recentFor(p.topic, 5)).map((q) => `- ${q}`).join('\n') || '(none)'}
Reply as JSON: {"questions":[{"topic":"id","q":"...","options":["A","B","C","D"],"answerIndex":0-3,"explanation":"why the answer is right and why the common wrong picks are wrong"}]}
Shuffle where the correct answer sits.`,
    },
  ], { temperature: 0.9 });
  const questions = (out.questions ?? []).filter((q) => q.q && q.options?.length === 4 && q.answerIndex >= 0 && q.answerIndex < 4);
  questions.forEach((q) => remember(q.topic, q.q));
  res.json({ questions });
}));

api.post('/quiz/result', (req, res) => {
  const { results = [], level } = req.body ?? {};
  db.quizzes.push({ id: randomUUID(), at: Date.now(), level, results });
  save();
  res.json({ ok: true });
});

// ───────────────────────── coding lab ─────────────────────────

const LANGS = ['javascript', 'typescript', 'rust', 'dart', 'python', 'sql'];

api.post('/challenges', wrap(async (req, res) => {
  const { topic = 'javascript', language = 'javascript', difficulty = 'medium' } = req.body ?? {};
  const lang = LANGS.includes(language) ? language : 'javascript';
  const angle = pick(['string manipulation', 'arrays and hashing', 'recursion', 'sorting/searching', 'data structure design', 'parsing', 'dates and intervals', 'graph/tree traversal', 'caching/memoization', 'state machines', 'rate limiting / scheduling', 'text formatting']);
  const sql = lang === 'sql';
  // The model also writes a reference solution; we run it against its own tests and keep only the
  // tests where both agree. This weeds out wrong expected values from smaller local models.
  let out: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    out = await generateChallenge(lang, topic, difficulty, angle, sql);
    if (sql) break;
    const good = validateTests(out);
    if (good.length >= 3) { out.tests = good; break; }
    if (attempt === 2) throw new Error('Could not produce a consistent problem — try again or use a stronger model.');
  }
  delete out.referenceSolution;
  res.json({ ...out, language: lang, topic, difficulty });
}));

function validateTests(p: any): { args: unknown[]; expected: unknown }[] {
  try {
    const ctx = vm.createContext({});
    const fn = vm.runInContext(`${p.referenceSolution};\n(typeof ${p.functionName} === 'function' ? ${p.functionName} : null)`, ctx, { timeout: 1000 });
    if (!fn) return [];
    return (p.tests ?? []).filter((t: any) => {
      try {
        const got = vm.runInContext(`JSON.stringify(f(...JSON.parse(args)))`, Object.assign(ctx, { f: fn, args: JSON.stringify(t.args) }), { timeout: 1000 });
        return got === JSON.stringify(t.expected);
      } catch { return false; }
    });
  } catch { return []; }
}

async function generateChallenge(lang: string, topic: string, difficulty: string, angle: string, sql: boolean) {
  return chatJson<any>([
    { role: 'system', content: 'You design original, interview-style coding problems with unambiguous specs and correct test cases. Test cases MUST be correct — double check each expected value.' },
    {
      role: 'user',
      content: `Create one ${difficulty === 'warm-up' ? 'WARM-UP coding problem: trivially easy (3-8 lines), meant to shake off rust and build confidence' : `${difficulty} coding problem`}. Topic context: ${topicLabel(topic)}. Theme: ${angle}. Language: ${lang}.
${sql ? 'Describe the table schemas in the description. "functionName" must be "query". Tests describe sample rows and expected result rows.' : 'It must be ONE synchronous pure function (no timers, promises, randomness, dates-of-now) solvable in under 40 lines. Inputs and output must be FLAT and simple: numbers, strings, booleans, or arrays of those (no objects, no mixed-type arrays, no nesting beyond one level) so they translate cleanly to Rust and Dart. Rust and Dart starters must use only standard-library types (e.g. Vec<i32>, &str, String), never external crates such as serde_json.'}
Seed for variety: ${Math.random().toString(36).slice(2, 8)}
Reply as JSON:
{
 "title": "...",
 "simple": "TWO short plain-English sentences saying what the function should do. No jargon.",
 "description": "concise full spec: max 80 words plus constraints",
 "functionName": "camelCaseName",
 "examples": [{"input": "human readable", "output": "human readable", "note": "optional"}],
 "starter": {"javascript": "function name(args) {\\n  // your code\\n}", "typescript": "...", "rust": "...", "dart": "...", "python": "...", "sql": "..."},
 "tests": [{"args": [JSON values for each parameter], "expected": JSON value}] (5 to 7 cases incl. edge cases),
 "hints": ["progressive hint 1 (nudge)", "hint 2", "hint 3 (near-solution)"],
 "complexity": "target time/space complexity",
 "referenceSolution": "a correct, complete JavaScript implementation of functionName"
}
Provide starters for ALL six languages with the idiomatic signature in each.`,
    },
  ], { temperature: 0.9 });
}

api.post('/explain', wrap(async (req, res) => {
  const { kind, problem, topic, title, markdown, language } = req.body ?? {};
  const subject = kind === 'lesson'
    ? `Lesson "${title}" (${topicLabel(topic)}):
${String(markdown ?? '').slice(0, 3500)}`
    : `Coding problem "${problem?.title}":
${problem?.simple ?? ''}
${problem?.description ?? ''}
Example tests: ${JSON.stringify((problem?.tests ?? []).slice(0, 3))}
Language: ${language ?? 'any'}`;
  const task = kind === 'lesson'
    ? 'Give a 30-second visual recap of the single most important idea in this lesson, using one tiny concrete example.'
    : 'Walk the learner into this problem: restate it simply, trace ONE tiny example by hand step by step, then reveal the approach in plain words (no full solution code).';
  const out = await chatJson<{ title: string; steps: { say: string; show?: any }[] }>([
    { role: 'system', content: 'You are a warm, encouraging coach explaining things to an engineer who is rusty and tired of reading walls of text. Short sentences. Spoken style. No jargon without a quick explanation.' },
    {
      role: 'user',
      content: `${subject}

${task}
Write 6 to 9 steps. Each step: "say" = what you speak aloud (max 25 words, conversational), and "show" = a simple visual:
- {"kind":"array","items":["2","7","11","15"],"highlight":[0,1],"pointers":{"left":0,"right":1},"caption":"short label"}
- {"kind":"kv","items":["seen=2:0","target=9"],"highlight":[0],"caption":"..."}   (items are "key=value")
- {"kind":"stack","items":["top","...","bottom"],"highlight":[0]}
- {"kind":"code","items":["line 1","line 2"],"highlight":[1]}     (pseudo-code, max 6 short lines)
- {"kind":"text","items":["One big phrase"]}
Items are always strings. Use "text" for the opening and closing steps, and array/kv/stack to animate the traced example, changing highlights and pointers between steps so it feels like motion.
Reply as JSON: {"title":"...","steps":[{"say":"...","show":{...}}]}`,
    },
  ], { temperature: 0.6 });
  const steps = (out.steps ?? []).filter((x) => x?.say).slice(0, 12);
  if (steps.length < 3) throw new Error('Explainer came back too short — try again.');
  res.json({ title: out.title ?? 'Walkthrough', steps });
}));

api.post('/challenges/review', wrap(async (req, res) => {
  const { problem, code, language, runResults } = req.body ?? {};
  if (!problem || !code) return res.status(400).json({ error: 'problem and code required' });
  const executed = language === 'javascript' || language === 'typescript';
  const review = await chatJson<{
    passed: boolean; score: number; correctness: string; complexity: string; quality: string; improvements: string[]; betterSolution: string;
  }>([
    { role: 'system', content: 'You are a staff engineer doing a strict but encouraging code review of an interview solution.' },
    {
      role: 'user',
      content: `Problem: ${problem.title}\n${problem.description}\nTarget: ${problem.complexity ?? 'n/a'}\nTest cases (JSON): ${JSON.stringify(problem.tests)}\n
Language: ${language}
Candidate code:\n${String(code).slice(0, 5000)}
${executed ? `Actual test run results: ${JSON.stringify(runResults ?? 'not run')}` : 'This language is not executed here: mentally trace the code against each test case and decide honestly if it compiles and passes.'}
Reply as JSON: {"passed": boolean, "score": 0-100, "correctness": "...", "complexity": "time/space of their solution and whether it meets the target", "quality": "readability, idioms, naming", "improvements": ["max 4"], "betterSolution": "an optimal solution in ${language}"}`,
    },
  ], { temperature: 0.3 });
  db.attempts.push({ id: randomUUID(), at: Date.now(), topic: problem.topic, title: problem.title, language, difficulty: problem.difficulty, score: review.score, passed: review.passed });
  save();
  res.json(review);
}));

api.post('/challenges/hint', wrap(async (req, res) => {
  const { problem, code, level = 1 } = req.body ?? {};
  const out = await chatJson<{ hint: string }>([
    { role: 'system', content: 'You are a patient interviewer giving hints without revealing the full solution.' },
    { role: 'user', content: `Problem: ${problem?.title}\n${problem?.description}\nCandidate code so far:\n${String(code ?? '').slice(0, 3000)}\nGive hint level ${level} of 3 (1 = gentle nudge, 3 = almost the approach). JSON: {"hint": "..."}` },
  ], { temperature: 0.5 });
  res.json(out);
}));

// ───────────────────────── stats ─────────────────────────

export function topicScores() {
  const interviews = Object.values<any>(db.interviews).filter((s) => s.report);
  const topicAgg: Record<string, number[]> = {};
  interviews.forEach((s) => s.report.topicScores.forEach((t: any) => (topicAgg[t.topic] ??= []).push(t.score)));
  db.quizzes.forEach((q) => (q.results as any[]).forEach((r) => (topicAgg[r.topic] ??= []).push(r.correct ? 100 : 0)));
  db.attempts.forEach((a) => a.topic && (topicAgg[a.topic] ??= []).push(a.score));
  return Object.entries(topicAgg).map(([topic, v]) => ({ topic, score: Math.round(v.reduce((a, b) => a + b, 0) / v.length), samples: v.length }));
}

api.get('/stats', (_req, res) => {
  const interviews = Object.values<any>(db.interviews).filter((s) => s.report);
  const topics = topicScores();

  const days = new Set<string>();
  const mark = (t: number) => days.add(new Date(t).toDateString());
  Object.values<any>(db.interviews).forEach((s) => mark(s.createdAt));
  db.attempts.forEach((a) => mark(a.at));
  db.quizzes.forEach((q) => mark(q.at));
  let streak = 0;
  let d = new Date();
  if (!days.has(d.toDateString())) d = new Date(d.getTime() - 864e5); // today not practised yet: streak still alive from yesterday
  while (days.has(d.toDateString())) { streak++; d = new Date(d.getTime() - 864e5); }

  res.json({
    interviews: interviews.length,
    quizzes: db.quizzes.length,
    challenges: db.attempts.length,
    solved: db.attempts.filter((a) => a.passed).length,
    streak,
    topics,
    weakest: [...topics].sort((a, b) => a.score - b.score).slice(0, 3),
    recent: interviews.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map((s) => ({ id: s.id, at: s.createdAt, overall: s.report.overall, level: s.level, topics: s.config.topics })),
  });
});

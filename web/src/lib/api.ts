export interface Topic { id: string; label: string; group: string; focus: string }
export interface Evaluation { score: number; summary: string; strengths: string[]; gaps: string[]; modelAnswer: string }
export interface Metrics { source: 'voice' | 'text'; wpm: number; fillers: number; durationSec: number }
export interface Turn {
  question: string; topic: string; kind: string; followUp: 'gap' | 'harder' | null;
  answer?: string; metrics?: Metrics | null; evaluation?: Evaluation;
}
export interface Report {
  overall: number; topicScores: { topic: string; score: number }[]; verdict: string; hireSignal: string;
  strengths: string[]; weaknesses: string[]; communication: number; depth: number;
  studyPlan: { topic: string; why: string; practice: string }[];
}
export interface Session {
  id: string; level: string; status: 'active' | 'finished'; createdAt: number; slotIndex: number; total: number;
  config: { topics: string[]; style: string; count: number; input: 'text' | 'voice'; video: boolean };
  turns: Turn[]; report: Report | null;
}
export interface Problem {
  title: string; simple?: string; description: string; functionName: string; language: string; topic: string; difficulty: string;
  examples: { input: string; output: string; note?: string }[];
  starter: Record<string, string>; tests: { args: unknown[]; expected: unknown }[]; hints: string[]; complexity?: string;
}
export interface QuizQ { topic: string; q: string; options: string[]; answerIndex: number; explanation: string }
export interface Stats {
  interviews: number; quizzes: number; challenges: number; solved: number; streak: number;
  topics: { topic: string; score: number; samples: number }[]; weakest: { topic: string; score: number }[];
  recent: { id: string; at: number; overall: number; level: string; topics: string[] }[];
}
export interface Health {
  active: string; settings: { provider: string; ollamaModel: string; claudeModel: string };
  ollama: { ok: boolean; models: string[] }; openai: { ok: boolean; model: string | null };
}

async function req<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  config: () => req<{ topics: Topic[]; levels: string[] }>('/config'),
  health: () => req<Health>('/health'),
  stats: () => req<Stats>('/stats'),
  saveSettings: (s: Partial<Health['settings']>) => req('/settings', s, 'PUT'),
  startInterview: (b: unknown) => req<Session>('/interviews', b),
  getInterview: (id: string) => req<Session>(`/interviews/${id}`),
  listInterviews: () => req<(Omit<Session, 'turns'> & { turns: number })[]>('/interviews'),
  answer: (id: string, answer: string, metrics: Metrics | null) =>
    req<{ evaluation: Evaluation; next: Turn | null; done: boolean }>(`/interviews/${id}/answer`, { answer, metrics }),
  finish: (id: string) => req<Session & { discarded?: boolean }>(`/interviews/${id}/finish`, {}),
  quiz: (b: unknown) => req<{ questions: QuizQ[] }>('/quiz', b),
  quizResult: (b: unknown) => req('/quiz/result', b),
  challenge: (b: unknown) => req<Problem>('/challenges', b),
  review: (b: unknown) => req<Review>('/challenges/review', b),
  hint: (b: unknown) => req<{ hint: string }>('/challenges/hint', b),
  explain: (b: unknown) => req<{ title: string; steps: import('../components/Walkthrough').WtStep[] }>('/explain', b),
};

export interface Review {
  passed: boolean; score: number; correctness: string; complexity: string; quality: string; improvements: string[]; betterSolution: string;
}

/* ───────── prepare ───────── */
export interface Profile { role: string; level: string; interviewDate: string; hoursPerDay: number; focus: string[]; leetcodeUser: string }
export interface PlanTask { id: string; type: 'learn' | 'flashcards' | 'quiz' | 'lab' | 'interview' | 'leetcode' | 'review'; topic: string; title: string; minutes: number; module?: string; lc?: string }
export interface Plan {
  createdAt: number; interviewDate: string; focus: string[]; daysLeft: number; truncated: boolean;
  days: { day: number; date: string; theme: string; tasks: PlanTask[] }[]; done: Record<string, boolean>;
}
export interface ModuleInfo { title: string; summary: string; cached: boolean; done: boolean }
export interface Card { id: string; front: string; back: string; ease: number; interval: number; due: number; reps: number }
export interface LeetCode {
  username: string; fetchedAt: number; ranking: number | null;
  solved: { total: number; easy: number; medium: number; hard: number };
  core: { slug: string; name: string; target: number; solved: number; pct: number }[]; weakTags: string[];
  recent: { title: string; titleSlug: string; timestamp: string }[];
}
export interface LcProblem { title: string; titleSlug: string; difficulty: string; acRate: number; url: string }

export const prep = {
  profile: () => req<Profile>('/prepare/profile'),
  saveProfile: (p: Partial<Profile>) => req<Profile>('/prepare/profile', p, 'PUT'),
  plan: () => req<Plan | null>('/prepare/plan'),
  makePlan: (p: Partial<Profile>) => req<Plan>('/prepare/plan', p),
  progress: (id: string, done: boolean) => req<Record<string, boolean>>('/prepare/plan/progress', { id, done }, 'PUT'),
  curriculum: (topic: string) => req<{ modules: ModuleInfo[] }>(`/prepare/curriculum/${topic}`),
  lesson: (topic: string, title: string, refresh = false) => req<{ markdown: string; done?: boolean }>('/prepare/lesson', { topic, title, refresh }),
  lessonDone: (topic: string, title: string, done: boolean) => req('/prepare/lesson/done', { topic, title, done }),
  decks: () => req<{ topic: string; total: number; due: number }[]>('/prepare/decks'),
  genCards: (topic: string, module?: string, count = 10) => req<{ added: number; total: number }>('/prepare/decks/generate', { topic, module, count }),
  due: (topic: string) => req<{ total: number; cards: Card[] }>(`/prepare/decks/${topic}/due`),
  review: (topic: string, id: string, grade: number) => req<Card>(`/prepare/decks/${topic}/review`, { id, grade }),
  lc: () => req<LeetCode | null>('/prepare/leetcode'),
  lcSync: (username: string) => req<LeetCode>('/prepare/leetcode/sync', { username }),
  lcRecommend: (kind: string, difficulty?: string) =>
    req<{ total: number; problems: LcProblem[] }>(`/prepare/leetcode/recommend?kind=${kind}${difficulty ? `&difficulty=${difficulty}` : ''}`),
};

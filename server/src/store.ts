import fs from 'node:fs';
import path from 'node:path';
import { MongoClient, type Collection } from 'mongodb';

export interface Settings { provider: 'ollama' | 'claude' | 'openai'; ollamaModel: string; claudeModel: string }
export interface DB {
  settings: Settings;
  interviews: Record<string, any>;
  attempts: any[]; // coding lab
  quizzes: any[];
  asked: Record<string, string[]>; // topic -> recent question texts (to keep things fresh)
  profile: Profile;
  outlines: Record<string, { title: string; summary: string }[]>; // "topic|level" -> lesson list
  lessons: Record<string, { markdown: string; at: number; done?: boolean }>; // "topic|level|title" -> cached lesson
  decks: Record<string, Card[]>; // topic -> flashcards with spaced-repetition state
  plan: any | null;
  leetcode: any | null;
}
export interface Profile { role: string; level: string; interviewDate: string; hoursPerDay: number; focus: string[]; leetcodeUser: string }
export interface Card { id: string; front: string; back: string; ease: number; interval: number; due: number; reps: number }
const META_KEYS = ['settings', 'asked', 'profile', 'outlines', 'lessons', 'decks', 'plan', 'leetcode'] as const;

const defaults: DB = {
  settings: { provider: 'claude', ollamaModel: 'qwen3.5:9b', claudeModel: 'sonnet' },
  interviews: {}, attempts: [], quizzes: [], asked: {},
  profile: { role: 'Full-stack developer', level: 'mid', interviewDate: '', hoursPerDay: 2, focus: ['javascript', 'rust', 'database'], leetcodeUser: '' },
  outlines: {}, lessons: {}, decks: {}, plan: null, leetcode: null,
};

/** In-memory working copy; save() write-throughs only the documents that changed to MongoDB. */
export const db: DB = structuredClone(defaults);

const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27017';
const MONGO_DB = process.env.MONGO_DB ?? 'interview_prep';

let cols: { interviews: Collection<any>; attempts: Collection<any>; quizzes: Collection<any>; meta: Collection<any> };
const snap = { interviews: new Map<string, string>(), attempts: new Map<string, string>(), quizzes: new Map<string, string>(), meta: new Map<string, string>() };

export async function initStore() {
  const client = await MongoClient.connect(MONGO_URL, { serverSelectionTimeoutMS: 4000 });
  const d = client.db(MONGO_DB);
  cols = { interviews: d.collection('interviews'), attempts: d.collection('attempts'), quizzes: d.collection('quizzes'), meta: d.collection('meta') };

  // One-time import of the old JSON file store, if there is one and Mongo is still empty.
  const legacy = path.resolve(process.cwd(), 'data', 'db.json');
  if (fs.existsSync(legacy) && !(await cols.meta.countDocuments())) {
    const old = JSON.parse(fs.readFileSync(legacy, 'utf8')) as Partial<DB>;
    Object.assign(db, { ...structuredClone(defaults), ...old });
    persist(true);
    await flush();
    fs.renameSync(legacy, legacy + '.imported');
    console.log('[store] imported legacy data/db.json into MongoDB');
    return;
  }

  for (const m of await cols.meta.find().toArray()) {
    const key = m._id as (typeof META_KEYS)[number];
    if (META_KEYS.includes(key)) {
      const base = defaults[key];
      (db as any)[key] = base && typeof base === 'object' && !Array.isArray(base) ? { ...base, ...m.value } : m.value;
    }
    snap.meta.set(String(m._id), JSON.stringify(m.value));
  }
  for (const doc of await cols.interviews.find().toArray()) { db.interviews[doc._id as unknown as string] = { ...doc, id: doc._id }; snap.interviews.set(String(doc._id), JSON.stringify(strip(doc))); }
  db.attempts = await cols.attempts.find().sort({ at: 1 }).toArray();
  db.quizzes = await cols.quizzes.find().sort({ at: 1 }).toArray();
  db.attempts.forEach((a) => snap.attempts.set(String(a._id), JSON.stringify(strip(a))));
  db.quizzes.forEach((a) => snap.quizzes.set(String(a._id), JSON.stringify(strip(a))));
  console.log(`[store] MongoDB ready (${MONGO_DB}): ${Object.keys(db.interviews).length} interviews`);
}

const strip = ({ _id, ...rest }: any) => rest;

let queue: Promise<void> = Promise.resolve();
let force = false;
const persist = (all = false) => { force ||= all; };

async function sync(col: Collection<any>, seen: Map<string, string>, docs: any[]) {
  const live = new Set<string>();
  for (const doc of docs) {
    const id = String(doc.id ?? doc._id);
    live.add(id);
    const body = strip({ ...doc, id });
    const json = JSON.stringify(body);
    if (force || seen.get(id) !== json) {
      await col.replaceOne({ _id: id } as any, body, { upsert: true });
      seen.set(id, json);
    }
  }
  for (const id of [...seen.keys()]) if (!live.has(id)) { await col.deleteOne({ _id: id } as any); seen.delete(id); }
}

async function flush() {
  await sync(cols.interviews, snap.interviews, Object.values(db.interviews));
  await sync(cols.attempts, snap.attempts, db.attempts);
  await sync(cols.quizzes, snap.quizzes, db.quizzes);
  for (const key of META_KEYS) {
    const value = db[key];
    const json = JSON.stringify(value);
    if (force || snap.meta.get(key) !== json) { await cols.meta.replaceOne({ _id: key } as any, { value }, { upsert: true }); snap.meta.set(key, json); }
  }
  force = false;
}

let timer: NodeJS.Timeout | null = null;
export function save() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    queue = queue.then(flush).catch((e) => console.error('[store] save failed:', e.message));
  }, 150);
}

export function remember(topic: string, question: string) {
  const list = (db.asked[topic] ??= []);
  list.push(question);
  if (list.length > 40) list.shift();
  save();
}

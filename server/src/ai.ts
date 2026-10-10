import { spawn } from 'node:child_process';
import os from 'node:os';
import { db } from './store.js';

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
export interface ChatOpts { json?: boolean; temperature?: number }

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';

async function ollamaChat(msgs: Msg[], opts: ChatOpts): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: db.settings.ollamaModel,
      messages: msgs,
      stream: false,
      think: false, // reasoning models: skip the hidden thinking pass for speed
      format: opts.json ? 'json' : undefined,
      options: { temperature: opts.temperature ?? 0.8 },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? '';
}

/** Uses the locally installed Claude Code CLI (your own login). Personal use only. */
function claudeCli(msgs: Msg[], opts: ChatOpts): Promise<string> {
  const system = msgs.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const convo = msgs
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}:\n${m.content}`)
    .join('\n\n');
  const prompt = opts.json ? `${convo}\n\nRespond with ONLY a single valid JSON object. No prose, no code fences.` : convo;
  const args = ['-p', '--output-format', 'text', '--system-prompt', system || 'You are a helpful assistant.'];
  if (db.settings.claudeModel) args.push('--model', db.settings.claudeModel);
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('claude CLI timed out')); }, 180_000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(out.trim()) : reject(new Error(`claude CLI exit ${code}: ${err.slice(0, 300)}`));
    });
    child.stdin.end(prompt);
  });
}

/** Any OpenAI-compatible endpoint: Groq / Gemini / OpenRouter free tiers, LM Studio, vLLM... */
async function openaiCompat(msgs: Msg[], opts: ChatOpts): Promise<string> {
  const base = process.env.OPENAI_BASE_URL;
  if (!base) throw new Error('OPENAI_BASE_URL not set');
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'llama-3.3-70b-versatile',
      messages: msgs,
      temperature: opts.temperature ?? 0.8,
      response_format: opts.json ? { type: 'json_object' } : undefined,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`OpenAI-compat ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? '';
}

const providers = { ollama: ollamaChat, claude: claudeCli, openai: openaiCompat } as const;
export type ProviderId = keyof typeof providers;

export async function chat(msgs: Msg[], opts: ChatOpts = {}): Promise<string> {
  const fn = providers[db.settings.provider as ProviderId] ?? ollamaChat;
  return fn(msgs, opts);
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error('no JSON in model output');
}

/** Ask for JSON, retry once with a repair nudge if the model rambles. */
export async function chatJson<T>(msgs: Msg[], opts: ChatOpts = {}): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await chat(
      attempt === 0 ? msgs : [...msgs, { role: 'user', content: 'Your previous reply was not valid JSON. Reply with ONLY the JSON object.' }],
      { ...opts, json: true },
    );
    try { return extractJson(text) as T; } catch (e) { lastErr = e; }
  }
  throw new Error(`AI returned invalid JSON: ${(lastErr as Error).message}`);
}

export async function health() {
  const out: Record<string, unknown> = { active: db.settings.provider, settings: db.settings };
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    const j = (await r.json()) as { models: { name: string }[] };
    out.ollama = { ok: true, models: j.models.map((m) => m.name) };
  } catch { out.ollama = { ok: false, models: [] }; }
  out.openai = { ok: !!process.env.OPENAI_BASE_URL, model: process.env.OPENAI_MODEL ?? null };
  return out;
}

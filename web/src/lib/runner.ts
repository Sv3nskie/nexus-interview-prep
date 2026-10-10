import { transform } from 'sucrase';

export interface TestResult { pass: boolean; got?: unknown; expected: unknown; error?: string; args: unknown[] }
export interface RunOutput { results: TestResult[]; logs: string[]; error?: string }

const WORKER_SRC = `
const safe = (v) => { try { return JSON.parse(JSON.stringify(v === undefined ? null : v)); } catch { return String(v); } };
const norm = (v) => Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, norm(v[k])])) : v;
const eq = (a, b) => JSON.stringify(norm(safe(a))) === JSON.stringify(norm(safe(b)));
self.onmessage = async (e) => {
  const { code, fn, tests } = e.data;
  const logs = [];
  console.log = (...a) => logs.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(safe(x))).join(' '));
  let f;
  try { f = new Function(code + '\\n;return typeof ' + fn + ' === "function" ? ' + fn + ' : undefined;')(); }
  catch (err) { postMessage({ results: [], logs, error: String(err) }); return; }
  if (!f) { postMessage({ results: [], logs, error: 'Function "' + fn + '" was not found. Keep the provided function name.' }); return; }
  const results = [];
  for (const t of tests) {
    try {
      let out = f(...structuredClone(t.args));
      if (out && typeof out.then === 'function') out = await out;
      results.push({ pass: eq(out, t.expected), got: safe(out), expected: t.expected, args: t.args });
    } catch (err) { results.push({ pass: false, error: String(err), expected: t.expected, args: t.args }); }
  }
  postMessage({ results, logs });
};`;

/** Runs user code against the tests inside a throwaway Worker with a hard timeout. */
export function runTests(source: string, language: string, fn: string, tests: { args: unknown[]; expected: unknown }[]): Promise<RunOutput> {
  let code = source;
  try {
    if (language === 'typescript') code = transform(source, { transforms: ['typescript'] }).code;
  } catch (e) {
    return Promise.resolve({ results: [], logs: [], error: `Syntax error: ${(e as Error).message}` });
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    const worker = new Worker(url);
    const done = (out: RunOutput) => { clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url); resolve(out); };
    const timer = setTimeout(() => done({ results: [], logs: [], error: 'Timed out after 4s — infinite loop or too slow?' }), 4000);
    worker.onmessage = (e) => done(e.data);
    worker.onerror = (e) => done({ results: [], logs: [], error: e.message });
    worker.postMessage({ code, fn, tests });
  });
}

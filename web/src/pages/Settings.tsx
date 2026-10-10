import { useEffect, useState } from 'react';
import { api, type Health } from '../lib/api';
import { Field } from '../components/ui';

export default function Settings() {
  const [h, setH] = useState<Health | null>(null);
  const [saved, setSaved] = useState(false);
  const load = () => api.health().then(setH);
  useEffect(() => { load(); }, []);
  if (!h) return null;

  const save = async (patch: Partial<Health['settings']>) => {
    await api.saveSettings(patch); await load(); setSaved(true); setTimeout(() => setSaved(false), 1200);
  };

  const providers = [
    { id: 'ollama', title: 'Ollama (local, free)', ok: h.ollama.ok, text: 'Runs open models on this machine or your own server. Zero API cost, fully private.' },
    { id: 'claude', title: 'Claude Code CLI', ok: true, text: 'Uses your local `claude` login for much smarter questions. Personal use only — not for a multi-user service.' },
    { id: 'openai', title: 'OpenAI-compatible', ok: h.openai.ok, text: 'Any free-tier or self-hosted endpoint (Groq, Gemini, OpenRouter, vLLM…). Set OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL in the server env.' },
  ];

  return (
    <div className="fade stack" style={{ gap: 20, maxWidth: 860 }}>
      <div className="page-head"><div><h1>AI <span className="grad">engine</span></h1><p>Choose what powers the interviewer. {saved && <span className="tag good">saved</span>}</p></div></div>
      <div className="stack" style={{ gap: 12 }}>
        {providers.map((p) => (
          <div key={p.id} className={`card action-card ${h.settings.provider === p.id ? 'glow' : ''}`} onClick={() => save({ provider: p.id } as never)}
            style={h.settings.provider === p.id ? { borderColor: 'var(--cyan)' } : undefined}>
            <div className="row between"><h2>{p.title}</h2><span className="row"><span className={`dot ${p.ok ? 'ok' : ''}`} />{h.settings.provider === p.id && <span className="tag">active</span>}</span></div>
            <p>{p.text}</p>
          </div>
        ))}
      </div>
      <div className="card stack">
        <Field label="Ollama model">
          <select value={h.settings.ollamaModel} onChange={(e) => save({ ollamaModel: e.target.value })}>
            {[...new Set([h.settings.ollamaModel, ...h.ollama.models])].map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <p className="muted" style={{ fontSize: '0.85rem' }}>Bigger models give noticeably better questions and grading. Try <span className="mono">ollama pull qwen3:14b</span> or <span className="mono">llama3.3</span> if your GPU/RAM allows.</p>
        <Field label="Claude model (optional, e.g. sonnet)">
          <input type="text" defaultValue={h.settings.claudeModel} placeholder="default" onBlur={(e) => e.target.value !== h.settings.claudeModel && save({ claudeModel: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

# NEXUS — AI Interview Prep

**[▶ Live preview & interactive explainer demo](https://sv3nskie.github.io/nexus-interview-prep/)** · MIT licensed

> The preview page is a static demo. The full app needs MongoDB and one AI engine (see below). The **Claude Code CLI** engine uses *your own* Claude login and is for personal use only; don't expose it as a multi-user service. Ollama or any OpenAI-compatible endpoint are the safe choices for hosting for others.

Dark, futuristic interview trainer for software developers. Voice + camera mock interviews, an
in-browser code lab, and rapid quizzes, all generated fresh by a **free/local** AI.

## Run

```bash
npm install
npm run dev        # API :8787 + web :5173  → open http://localhost:5173
```

Always-on (Docker, recommended): `docker compose up -d --build` → http://interview.localhost
- Restarts itself (`restart: unless-stopped`) and with Docker Desktop at login; no terminal needed.
- Uses your local MongoDB (`host.docker.internal:27017`) and your existing Claude login by mounting `~/.claude` into the container (shared, not copied).
- After code changes: `docker compose up -d --build`. Logs: `docker logs nexus`. Stop: `docker compose down`.

(`scripts/` holds an older Windows scheduled-task alternative that runs without Docker.)

## AI engine (no paid API)

Pick in the app under **AI Engine**:

| Provider | Cost | Notes |
|---|---|---|
| **Ollama** (default) | free | `ollama pull qwen3.5:9b`. Works on any server with enough RAM/GPU. Bigger model = better questions. |
| **Claude Code CLI** | your subscription | Best quality. Personal use only; do not put behind a multi-user service. |
| **OpenAI-compatible** | free tiers | Set `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL` (Groq, Gemini, OpenRouter, vLLM…). |

## How it stays "smart" and non-repetitive
- Every question gets a random *angle* (debugging, trade-offs, scaling, security…) plus a list of recently asked questions to avoid.
- Answers are graded in the same call that writes the next question; weak answers trigger a probing follow-up, strong ones sometimes a harder curveball.
- Coding problems ship with a model-written reference solution; the server runs it against the tests and discards any test the reference disagrees with.

## Voice / video
Browser-native: Web Speech API (STT + TTS, Chrome/Edge) and MediaRecorder. Video is recorded in memory only and never uploaded.

## Layout
- `server/` Express + TypeScript. `src/ai.ts` providers, `src/routes.ts` all endpoints, MongoDB store in `src/store.ts` (`MONGO_URL`, default `mongodb://127.0.0.1:27017`, db `interview_prep`).
- `web/` Vite + React + TypeScript. Monaco editor, Worker-sandboxed JS/TS runner.

## Path to SaaS
Add auth + per-user rows, and move to Ollama/vLLM on a GPU box or an OpenAI-compatible host.

## Roadmap
- [ ] Run Rust and Dart solutions in a sandbox instead of AI-traced review
- [ ] Screenshots and a short demo video in this README
- [ ] Per-user accounts for hosting it for others
- [ ] Export your study plan to a calendar

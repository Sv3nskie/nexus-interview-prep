import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type Evaluation, type Metrics, type Session, type Turn } from '../lib/api';
import { ErrorBox, Loader, scoreClass, topicName, useTopics } from '../components/ui';
import { countFillers, countWords, setMuted, speak, stopSpeaking, sttSupported, useDictation, useMedia } from '../lib/voice';

type Phase = 'speaking' | 'answering' | 'evaluating' | 'feedback' | 'finishing';

export default function InterviewRoom() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const topics = useTopics();
  const [session, setSession] = useState<Session | null>(null);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [turnNo, setTurnNo] = useState(0);
  const [phase, setPhase] = useState<Phase>('speaking');
  const [answer, setAnswer] = useState('');
  const [evalr, setEvalr] = useState<Evaluation | null>(null);
  const [pending, setPending] = useState<{ next: Turn | null; done: boolean } | null>(null);
  const [err, setErr] = useState('');
  const [muted, setMutedState] = useState(false);
  const [secs, setSecs] = useState(0);
  const usedVoice = useRef(false);

  const voiceMode = !!session && (session.config.input === 'voice' || session.config.video);
  const media = useMedia(!!session?.config.video, voiceMode);
  const dictation = useDictation(useCallback((t: string) => { usedVoice.current = true; setAnswer((a) => (a ? a + t : t)); }, []));
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    api.getInterview(id).then((s) => {
      setSession(s);
      const last = s.turns[s.turns.length - 1];
      setTurn(last); setTurnNo(s.turns.length);
      if (s.status === 'finished') nav(`/report/${id}`, { replace: true });
    }).catch((e) => setErr(e.message));
    return () => stopSpeaking();
  }, [id, nav]);

  useEffect(() => { if (videoRef.current && media.stream) videoRef.current.srcObject = media.stream; }, [media.stream]);
  useEffect(() => { if (session?.config.video && media.stream) media.startRecording(); }, [session, media.stream]); // eslint-disable-line

  // Ask the current question.
  const ask = useCallback((t: Turn) => {
    setPhase('speaking'); setAnswer(''); setEvalr(null); setSecs(0); usedVoice.current = false; dictation.reset();
    const begin = () => { setPhase('answering'); if (voiceMode && sttSupported) dictation.start(); };
    if (voiceMode) speak(t.question, begin); else begin();
  }, [voiceMode]); // eslint-disable-line

  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!session || !turn || asked.current === turn.question) return;
    if (!turn.evaluation && session.config.video && !media.stream && !media.error) return; // wait for camera permission
    asked.current = turn.question;
    if (turn.evaluation) { setPhase('feedback'); setEvalr(turn.evaluation); return; }
    ask(turn);
  }, [session, turn, ask, voiceMode, media.stream, media.error]);

  useEffect(() => {
    if (phase !== 'answering') return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const submit = async () => {
    const text = (answer + ' ' + dictation.interim).trim();
    if (!text || !turn) return;
    dictation.stop();
    setPhase('evaluating'); setErr('');
    let metrics: Metrics | null = null;
    if (usedVoice.current) {
      const dur = Math.max(dictation.elapsed(), 1);
      metrics = { source: 'voice', durationSec: dur, wpm: Math.round(countWords(text) / (dur / 60)), fillers: countFillers(text) };
    }
    try {
      const r = await api.answer(id, text, metrics);
      setEvalr(r.evaluation);
      setPending({ next: r.next, done: r.done });
      setPhase('feedback');
      if (voiceMode) speak(r.evaluation.summary);
    } catch (e) { setErr((e as Error).message); setPhase('answering'); }
  };

  const advance = async () => {
    stopSpeaking();
    if (!pending) return;
    if (pending.done || !pending.next) {
      setPhase('finishing');
      try { await media.stopRecording(id); await api.finish(id); nav(`/report/${id}`); } catch (e) { setErr((e as Error).message); setPhase('feedback'); }
      return;
    }
    setTurn(pending.next); setTurnNo((n) => n + 1); setPending(null);
  };

  const endEarly = async () => {
    stopSpeaking(); dictation.stop(); setPhase('finishing');
    try { await media.stopRecording(id); const r = await api.finish(id); nav(r.discarded ? '/' : `/report/${id}`); } catch (e) { setErr((e as Error).message); setPhase('answering'); }
  };

  const toggleMute = () => { setMuted(!muted); setMutedState(!muted); };
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (err && !session) return <ErrorBox msg={err} />;
  if (!session || !turn) return <Loader label="loading interview" />;

  const orb = phase === 'speaking' ? 'speaking' : phase === 'evaluating' || phase === 'finishing' ? 'thinking' : dictation.listening ? 'listening' : '';
  const slot = session.total;
  const current = Math.min(session.slotIndex + (pending ? 1 : 0), slot - 1);

  return (
    <div className="fade stack" style={{ gap: 18 }}>
      <div className="row between">
        <div className="row"><span className="tag">{topicName(topics, turn.topic)}</span><span className="tag v">{turn.kind}</span>
          {turn.followUp && <span className="tag warn">{turn.followUp === 'gap' ? 'follow-up' : 'curveball'}</span>}</div>
        <div className="row">
          <span className="timer">{fmt(secs)}</span>
          <button className="btn sm ghost" onClick={toggleMute}>{muted ? 'Voice off' : 'Voice on'}</button>
          <button className="btn sm danger" onClick={endEarly}>End & score</button>
        </div>
      </div>
      <div className="progress">{Array.from({ length: slot }, (_, i) => <i key={i} className={i < current || (i === current && phase === 'feedback' && !pending?.next) ? 'done' : i === current ? 'cur' : ''} />)}</div>

      <div className="room">
        <div className="card glow stack" style={{ gap: 16 }}>
          <div className="orb-wrap"><div className={`orb ${orb}`} /></div>
          <p className="question" key={turnNo}>{turn.question}</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            {voiceMode && <button className="btn sm ghost" onClick={() => speak(turn.question)}>↻ Replay question</button>}
          </div>

          {(phase === 'answering' || phase === 'speaking' || phase === 'evaluating') && (
            <>
              <textarea
                value={answer + (dictation.interim ? (answer ? ' ' : '') + dictation.interim : '')}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={voiceMode ? 'Speak your answer: your words appear here. You can edit before submitting.' : 'Type your answer as you would explain it out loud…'}
                disabled={phase !== 'answering'}
                style={{ minHeight: 170 }}
              />
              <div className="row between">
                <div className="row">
                  {sttSupported && (
                    <button className={`btn ${dictation.listening ? 'rec' : ''}`} disabled={phase !== 'answering'} onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}>
                      {dictation.listening ? '● Listening — tap to pause' : '🎙 Speak answer'}
                    </button>
                  )}
                  <span className="muted mono" style={{ fontSize: '0.8rem' }}>{countWords(answer)} words</span>
                </div>
                <button className="btn primary" disabled={phase !== 'answering' || !(answer + dictation.interim).trim()} onClick={submit}>
                  {phase === 'evaluating' ? 'Evaluating…' : 'Submit answer →'}
                </button>
              </div>
              {phase === 'evaluating' && <Loader label="your interviewer is thinking" />}
              {dictation.error && <ErrorBox msg={dictation.error} />}
            </>
          )}
          <ErrorBox msg={err} />

          {phase === 'feedback' && evalr && (
            <div className="stack fade">
              <div className="row between">
                <span className="label" style={{ margin: 0 }}>Feedback</span>
                <span className={`tag ${scoreClass(evalr.score * 10)}`}>{evalr.score}/10</span>
              </div>
              <p className="fb">{evalr.summary}</p>
              <div className="grid g2">
                <div><span className="label">Nailed</span><ul className="list good">{evalr.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
                <div><span className="label">Missing</span><ul className="list bad">{evalr.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
              </div>
              <details><summary className="muted" style={{ cursor: 'pointer' }}>See a strong answer</summary><div className="quote" style={{ marginTop: 10 }}>{evalr.modelAnswer}</div></details>
              {pending && <button className="btn primary" onClick={advance}>{pending.done ? 'Finish & see report →' : pending.next?.followUp ? 'Follow-up question →' : 'Next question →'}</button>}
            </div>
          )}
          {phase === 'finishing' && <Loader label="writing your report — this takes a moment" />}
        </div>

        <div className="stack">
          {session.config.video ? (
            <div className="cam">
              <video ref={videoRef} autoPlay muted playsInline />
              <span className="tag bad badge">● REC (local only)</span>
            </div>
          ) : voiceMode ? <div className="card muted">Mic active. Audio is transcribed by your browser.</div> : null}
          {media.error && <ErrorBox msg={media.error} />}
          {voiceMode && (
            <div className="card row between">
              <span className="label" style={{ margin: 0 }}>Mic level</span>
              <div className="meter">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ height: `${Math.max(3, media.level * 22 * (0.4 + ((i * 7) % 6) / 6))}px`, opacity: media.level > i / 14 ? 1 : 0.25 }} />)}</div>
            </div>
          )}
          <div className="card">
            <span className="label">Interview tips</span>
            <ul className="list muted" style={{ margin: 0 }}>
              <li>Lead with the answer, then justify it.</li>
              <li>Name trade-offs, not just the "right" option.</li>
              <li>Use a real example from your own work.</li>
              {voiceMode && <li>Aim for 120–160 words per minute; pause instead of saying "um".</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

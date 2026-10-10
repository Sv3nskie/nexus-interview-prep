import { useCallback, useEffect, useRef, useState } from 'react';

/* ───────── text to speech ───────── */

let muted = false;
export const isMuted = () => muted;
export const setMuted = (m: boolean) => { muted = m; if (m) window.speechSynthesis?.cancel(); };

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  return voices.find((v) => /natural|neural|online/i.test(v.name)) ?? voices.find((v) => /google|samantha|aria|jenny|guy/i.test(v.name)) ?? voices[0];
}

export function speak(text: string, onEnd?: () => void, onStart?: () => void) {
  const synth = window.speechSynthesis;
  if (!synth || muted) { onEnd?.(); return; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = pickVoice() ?? null;
  u.rate = 1.02;
  u.onstart = () => onStart?.();
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
}
export const stopSpeaking = () => window.speechSynthesis?.cancel();

/* ───────── speech to text ───────── */

const SR: any = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
export const sttSupported = !!SR;

const FILLERS = /\b(um+|uh+|er|erm|ah|like|you know|basically|sort of|kind of|i mean)\b/gi;
export const countFillers = (t: string) => (t.match(FILLERS) ?? []).length;
export const countWords = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** Continuous dictation. `onFinal` fires with each finalised chunk; `interim` is the live partial. */
export function useDictation(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const rec = useRef<any>(null);
  const want = useRef(false);
  const startedAt = useRef(0);
  const spokenMs = useRef(0);
  const cb = useRef(onFinal);
  cb.current = onFinal;

  const stop = useCallback(() => {
    want.current = false;
    rec.current?.stop();
    if (startedAt.current) { spokenMs.current += Date.now() - startedAt.current; startedAt.current = 0; }
    setListening(false); setInterim('');
  }, []);

  const start = useCallback(() => {
    if (!SR || want.current) return;
    setError('');
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = 'en-US';
    r.onresult = (e: any) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) cb.current(res[0].transcript.trim() + ' '); else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e: any) => { if (e.error !== 'no-speech' && e.error !== 'aborted') { setError(`Mic error: ${e.error}`); want.current = false; setListening(false); } };
    r.onend = () => { if (want.current) { try { r.start(); } catch { /* already started */ } } };
    rec.current = r;
    want.current = true;
    startedAt.current = Date.now();
    try { r.start(); setListening(true); } catch { /* ignore */ }
  }, []);

  useEffect(() => () => { want.current = false; rec.current?.abort(); }, []);

  /** total time the mic was open since last reset, in seconds */
  const elapsed = () => Math.round((spokenMs.current + (startedAt.current ? Date.now() - startedAt.current : 0)) / 1000);
  const reset = () => { spokenMs.current = 0; if (startedAt.current) startedAt.current = Date.now(); };
  return { listening, interim, error, start, stop, elapsed, reset };
}

/* ───────── camera / mic stream + recording ───────── */

/** Recordings live in memory only (never uploaded) so the report page can replay them. */
export const recordings = new Map<string, string>();

export function useMedia(video: boolean, enabled: boolean) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let s: MediaStream | null = null;
    let raf = 0;
    let ctx: AudioContext | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: video ? { width: 640, height: 480 } : false, audio: true })
      .then((st) => {
        s = st; setStream(st);
        ctx = new AudioContext();
        const an = ctx.createAnalyser(); an.fftSize = 256;
        ctx.createMediaStreamSource(st).connect(an);
        const buf = new Uint8Array(an.frequencyBinCount);
        const tick = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); setLevel(Math.min(1, m / 60)); raf = requestAnimationFrame(tick); };
        tick();
      })
      .catch((e) => setError(e.name === 'NotAllowedError' ? 'Camera/mic permission denied' : String(e.message ?? e)));
    return () => { cancelAnimationFrame(raf); ctx?.close(); s?.getTracks().forEach((t) => t.stop()); setStream(null); };
  }, [video, enabled]);

  const startRecording = useCallback(() => {
    if (!stream || !video || recorder.current) return;
    chunks.current = [];
    const r = new MediaRecorder(stream);
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.start(1000);
    recorder.current = r;
  }, [stream, video]);

  const stopRecording = useCallback((id: string) => new Promise<void>((resolve) => {
    const r = recorder.current;
    if (!r || r.state === 'inactive') return resolve();
    r.onstop = () => { recordings.set(id, URL.createObjectURL(new Blob(chunks.current, { type: 'video/webm' }))); recorder.current = null; resolve(); };
    r.stop();
  }), []);

  return { stream, level, error, startRecording, stopRecording };
}

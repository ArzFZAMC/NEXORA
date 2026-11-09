// Suara alarm: nada bawaan (WebAudio) atau audio unggahan pengguna. Browser dapat memblokir suara
// sebelum ada interaksi pengguna; tombol "Tes suara" di Pengaturan membuka izin tersebut.
let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = ctx ?? new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function beep(c: AudioContext, at: number, freq: number, dur: number) {
  const osc = c.createOscillator(); const gain = c.createGain();
  osc.type = 'sine'; osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(at); osc.stop(at + dur + 0.05);
}

/** Memutar nada pendek satu kali (untuk tes). */
export function playTestTone(): boolean {
  const c = audioCtx(); if (!c) return false;
  beep(c, c.currentTime, 880, 0.25); beep(c, c.currentTime + 0.3, 1175, 0.35);
  return true;
}

/** Memutar alarm berulang sampai stop() dipanggil. */
export function startAlarmSound(customUrl?: string): () => void {
  if (customUrl) {
    const audio = new Audio(customUrl); audio.loop = true;
    void audio.play().catch(() => undefined);
    return () => { audio.pause(); audio.currentTime = 0; };
  }
  const c = audioCtx();
  if (!c) return () => undefined;
  let stopped = false;
  const ring = () => {
    if (stopped) return;
    const t = c.currentTime;
    beep(c, t, 880, 0.22); beep(c, t + 0.28, 1175, 0.22); beep(c, t + 0.56, 880, 0.22); beep(c, t + 0.84, 1175, 0.3);
  };
  ring();
  const timer = window.setInterval(ring, 2200);
  return () => { stopped = true; window.clearInterval(timer); };
}

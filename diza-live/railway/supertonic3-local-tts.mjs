/**
 * Feature-gated natural Indonesian local speech, unlimited per-use (CPU-bound).
 * Single active synthesis keeps 1GB Railway RAM from being exhausted.
 * No Google requests or Android system TTS. Never fallback to a robotic voice.
 */
import { execFile } from 'node:child_process';
import { Readable } from 'node:stream';

const VOICE = 'id-ID-GadisNeural';
const PYTHON = '/opt/diza-live/stt-venv/bin/python';
const SCRIPT = '/opt/diza-live/tts-supertonic3.py';
const MAX_BYTES = 11_500_000;
let active = false;

export function offlineNaturalVoiceSelected(voiceId) {
  return process.env.SUPERTONIC3_TTS_ENABLED === '1' && voiceId === VOICE;
}
export async function speakOfflineIndonesian(text, voiceId) {
  if (!offlineNaturalVoiceSelected(voiceId)) return null;
  if (active) throw new Error('Suara natural lokal sedang memproses jawaban. Coba lagi.');
  active = true;
  try {
    const wav = await new Promise((resolve, reject) => {
      const child = execFile(PYTHON, [SCRIPT], {
        cwd: '/home/node',
        timeout: 55_000,
        maxBuffer: MAX_BYTES,
        encoding: 'buffer',
        env: {
          ...process.env,
          HF_HUB_OFFLINE: '1',
          HF_HUB_DISABLE_TELEMETRY: '1',
          OMP_NUM_THREADS: '2',
          OPENBLAS_NUM_THREADS: '2',
        },
      }, (error, stdout) => {
        if (error || !stdout || stdout.length < 844 || stdout.length > MAX_BYTES
          || stdout.toString('ascii', 0, 4) !== 'RIFF'
          || stdout.toString('ascii', 8, 12) !== 'WAVE') {
          reject(new Error('Suara natural lokal belum tersedia. Tidak diganti ke suara robot.'));
        } else {
          resolve(stdout);
        }
      });
      child.stdin?.on('error', () => {});
      child.stdin?.end(text.slice(0, 2500));
    });
    console.info('SUPERTONIC3_TTS=LOCAL_WAV_OK');
    return {
      stream: Readable.toWeb(Readable.from([wav])),
      mime: 'audio/wav',
    };
  } finally {
    active = false;
  }
}

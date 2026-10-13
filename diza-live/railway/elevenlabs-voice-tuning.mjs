// Per-agent ElevenLabs TTS tuning. Pure validation, no vendor calls and no secrets.
// Never modify a voice globally in the ElevenLabs account.
const LIMITS = Object.freeze({
  stability: [0, 1],
  similarity_boost: [0, 1],
  style: [0, 1],
  speed: [0.7, 1.2],
});
export function normalizeVoiceTuning(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const result = {};
  for (const [name, [min, max]] of Object.entries(LIMITS)) {
    if (!Object.hasOwn(raw, name)) return null;
    const value = raw[name];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return null;
    result[name] = value;
  }
  // Whitelist exactly four fields, never relay arbitrary user JSON to ElevenLabs.
  if (Object.keys(raw).some((key) => !Object.hasOwn(LIMITS, key))) return null;
  return result;
}

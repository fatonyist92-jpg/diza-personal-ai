// Chrome Android voice-input support for pinned Bloks 2.5.32.
// No paid voice API, no source or secret disclosure, desktop remains native.
import { readFileSync, writeFileSync } from "node:fs";
function replaceOnce(file, from, to, name) {
  const s = readFileSync(file, "utf8");
  const p = s.indexOf(from);
  if (p < 0 || s.indexOf(from, p + from.length) >= 0) throw Error("voice patch: " + name);
  writeFileSync(file, s.slice(0, p) + to + s.slice(p + from.length));
  console.log("voice input patched: " + name);
}
const composer="/opt/bloks/src/components/Composer.tsx";
const voice="/opt/bloks/src/components/Voice.tsx";
replaceOnce(composer,
 '  const baseText = useRef("");',
 [
 '  const baseText = useRef("");',
 '  const browserSpeech = useRef<any>(null);',
 '  useEffect(() => () => { browserSpeech.current?.abort?.(); browserSpeech.current = null; }, []);',
 '  useEffect(() => {',
 '    if (!recording && browserSpeech.current) {',
 '      const session=browserSpeech.current;',
 '      browserSpeech.current=null;',
 '      try { session.stop(); } catch {}',
 '    }',
 '  }, [recording]);',
 ].join("\n"),
 "composer mic lifecycle");

replaceOnce(composer,
 '  const toggleMic = async () => {\n    if (!window.bloks) {\n      setSpeechError("Voice input needs the desktop app. Run pnpm dev:desktop.");\n      return;\n    }\n    if (recording) return setRecording(false);',
 [
 '  const toggleMic = async () => {',
 '    if (recording) {',
 '      browserSpeech.current?.stop?.();',
 '      setRecording(false);',
 '      return;',
 '    }',
 '    if (!window.bloks) {',
 '      const Recognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;',
 '      if (!Recognition) {',
 '        setSpeechError("Pengenalan suara tidak tersedia di Chrome. Perbarui Chrome atau gunakan mikrofon keyboard.");',
 '        return;',
 '      }',
 '      baseText.current = text.trim();',
 '      setSpeechError(null);',
 '      setMicDenied(false);',
 '      const recog = new Recognition();',
 '      recog.lang = "id-ID";',
 '      recog.continuous = false;',
 '      recog.interimResults = true;',
 '      recog.maxAlternatives = 1;',
 '      recog.onresult = (event: any) => {',
 '        let heard = "";',
 '        let finalResult = false;',
 '        for (let i=0; i<event.results.length; i++) {',
 '          heard += String(event.results[i]?.[0]?.transcript ?? "") + " ";',
 '          if (event.results[i]?.isFinal) finalResult = true;',
 '        }',
 '        heard = heard.trim();',
 '        const base = baseText.current;',
 '        if (heard) setText(base ? base + " " + heard : heard);',
 '        if (finalResult) {',
 '          try { recog.stop(); } catch {}',
 '          setRecording(false);',
 '        }',
 '      };',
 '      recog.onerror = (event: any) => {',
 '        const code = String(event.error ?? "unknown");',
 '        if (code === "not-allowed" || code === "service-not-allowed") {',
 '          setMicDenied(true);',
 '          setSpeechError("Mikrofon diblokir. Izinkan mikrofon Bloks dalam pengaturan situs Chrome.");',
 '        } else if (code === "no-speech") {',
 '          setSpeechError("Tidak terdengar suara. Tekan mikrofon dan coba lagi.");',
 '        } else {',
 '          setSpeechError("Pengenalan suara gagal: " + code);',
 '        }',
 '        setRecording(false);',
 '      };',
 '      recog.onend = () => {',
 '        if (browserSpeech.current === recog) browserSpeech.current=null;',
 '        setRecording(false);',
 '      };',
 '      try {',
 '        // Start inside user tap, not a delayed effect, for Chrome permission.',
 '        recog.start();',
 '        browserSpeech.current = recog;',
 '        setRecording(true);',
 '      } catch {',
 '        setSpeechError("Gagal membuka mikrofon Chrome. Periksa izin situs.");',
 '        setRecording(false);',
 '      }',
 '      return;',
 '    }',
 ].join("\n"),
 "Chrome Android can speak into message composer");

replaceOnce(composer,
 '              onClick={() => void window.bloks?.permOpenSettings(speechPane)}',
 '              onClick={() => { if (window.bloks) void window.bloks.permOpenSettings(speechPane); else setSpeechError("Buka pengaturan situs Chrome dan izinkan Mikrofon untuk Bloks."); }}',
 "Chrome permission instruction");

// Use Indonesian recognition in Calls, preserving Electron fallback and
// allowing an actual Chrome microphone error to be displayed in CallOverlay.
replaceOnce(voice,
 '    recog.continuous = false;\n    recog.interimResults = true;',
 '    recog.lang = "id-ID";\n    recog.continuous = false;\n    recog.interimResults = true;\n    recog.maxAlternatives = 1;',
 "Indonesian speech recognition in calls");
replaceOnce(voice,
 '    recog.start();\n    return { stop: () => recog.stop(), needsManualFinish: false };',
 [
 '    try {',
 '      recog.start();',
 '      return { stop: () => recog.stop(), needsManualFinish: false };',
 '    } catch {',
 '      handlers.onError("Chrome tidak bisa membuka mikrofon. Periksa izin situs.");',
 '      return null;',
 '    }',
 ].join("\n"),
 "Call mic start error handling");

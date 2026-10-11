// Activate verified local Zipformer voice capture AFTER the upstream browser
// patch, without touching original Bloks desktop/agent/paid provider behavior.
// All private STT routes inherit the existing token/cookie authorization.
import { readFileSync, writeFileSync } from "node:fs";
function put(file, from, to, label) {
  const s=readFileSync(file,"utf8"), i=s.indexOf(from);
  if(i<0 || s.indexOf(from,i+from.length)!==-1) throw Error("local voice patch: "+label);
  writeFileSync(file,s.slice(0,i)+to+s.slice(i+from.length));
  console.log("local voice patched: "+label);
}
function putFirstDuplicate(file, from, to, label) {
  const text=readFileSync(file,"utf8");
  if(text.split(from).length-1!==2) throw Error("local voice patch (expected two original Call implementations): "+label);
  const index=text.indexOf(from);
  writeFileSync(file,text.slice(0,index)+to+text.slice(index+from.length));
  console.log("local voice patched first Call only: "+label);
}
const composer="/opt/bloks/src/components/Composer.tsx";
const voice="/opt/bloks/src/components/Voice.tsx";
const server="/opt/bloks/server/index.ts";

put(server,
 'import * as speech from "./speech.ts";',
 'import * as speech from "./speech.ts";\nimport { transcribeBrowserAudio } from "./browser-stt.ts";',
 "import authenticated local audio recognizer");
put(server,
 '    // ── voices: how agents sound ──',
 [
 '    // Private, rate-limited, same-origin browser speech recognition.',
 '    // Authentication is enforced by the existing /api guard above.',
 '    if (method === "POST" && path === "/api/bloks-stt/transcribe") {',
 '      const result = await transcribeBrowserAudio(req);',
 '      return json(res, result.status, result.body);',
 '    }',
 '    // ── voices: how agents sound ──',
 ].join("\n"),
 "private authenticated binary transcription endpoint");

put(composer,
 'import Mic from "lucide-react/dist/esm/icons/mic.mjs";',
 'import Mic from "lucide-react/dist/esm/icons/mic.mjs";\nimport { startBrowserMic, type BrowserMicSession } from "@/lib/browserMic";',
 "use local browser recorder, not Google Web Speech");
put(composer,
 '  const browserSpeech = useRef<any>(null);',
 [
 '  const browserSpeech = useRef<any>(null);',
 '  const localMic = useRef<BrowserMicSession | null>(null);',
 '  const localMicPending = useRef(false);',
 '  const [transcribingAudio, setTranscribingAudio] = useState(false);',
 '  useEffect(() => () => { localMic.current?.cancel(); localMic.current=null; }, []);',
 ].join("\n"),
 "Composer owns recorder, cancellation, processing feedback");

put(composer,
 '  const toggleMic = async () => {',
 [
 '  const toggleMic = async () => {',
 '    if (!window.bloks) {',
 '      if (localMic.current) {',
 '        localMic.current.stop();',
 '        localMic.current = null;',
 '        setRecording(false);',
 '        return;',
 '      }',
 '      if (localMicPending.current || transcribingAudio) return;',
 '      localMicPending.current = true;',
 '      setSpeechError(null);',
 '      setMicDenied(false);',
 '      baseText.current = text.trim();',
 '      try {',
 '        const mic = await startBrowserMic({',
 '          onFinal: (words) => {',
 '            const base = baseText.current;',
 '            setText(base ? base + " " + words : words);',
 '            setTranscribingAudio(false);',
 '            setRecording(false);',
 '            localMic.current = null;',
 '          },',
 '          onSilence: () => {',
 '            setSpeechError("Belum terdengar kata-kata. Coba lagi.");',
 '            setTranscribingAudio(false);',
 '            setRecording(false);',
 '            localMic.current = null;',
 '          },',
 '          onError: (message) => {',
 '            setSpeechError(message);',
 '            setTranscribingAudio(false);',
 '            setRecording(false);',
 '            localMic.current = null;',
 '          },',
 '          onProcessing: () => { setTranscribingAudio(true); setRecording(false); },',
 '        }, false);',
 '        localMic.current = mic;',
 '        setRecording(true);',
 '      } catch (err) {',
 '        setSpeechError(err instanceof Error ? err.message : "Mikrofon tidak bisa dibuka.");',
 '        setRecording(false);',
 '      } finally {',
 '        localMicPending.current = false;',
 '      }',
 '      return;',
 '    }',
 ].join("\n"),
 "use real Chrome mic capture and local speech recognition in Composer");

put(composer,
 '      {speechError && (',
 [
 '      {transcribingAudio && (',
 '        <div className="mx-auto mb-2 max-w-[760px] px-3 text-[12px] text-muted-foreground">',
 '          Sedang mengenali suara menjadi teks…',
 '        </div>',
 '      )}',
 '      {speechError && (',
 ].join("\n"),
 "show speech transcription progress, not a false recording state");

// Call mode uses the same private local Zipformer path. This replaces Chrome's
// flaky SpeechRecognition in WebView, while keeping the original desktop
// bridge fallback.
put(voice,
 'import { thisComputer } from "@/lib/thisComputer";',
 'import { thisComputer } from "@/lib/thisComputer";\nimport { startBrowserMic, type BrowserMicSession } from "@/lib/browserMic";',
 "Call imports same local voice capture");

put(voice,
 '  onSilence: () => void;\n  onError: (message: string) => void;\n}): { stop: () => void; needsManualFinish: boolean } | null {',
 [
 '  onSilence: () => void;',
 '  onError: (message: string) => void;',
 '  onProcessing?: () => void;',
 '}): { stop: () => void; needsManualFinish: boolean } | null {',
 ].join("\n"),
 "Call can display local transcription progress");

put(voice,
 '  const Recognition =\n    (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;',
 [
 '  if (!window.bloks) {',
 '    let cancelled = false;',
 '    let capture: BrowserMicSession | null = null;',
 '    void startBrowserMic({',
 '      onFinal: handlers.onFinal,',
 '      onSilence: handlers.onSilence,',
 '      onError: handlers.onError,',
 '      onProcessing: handlers.onProcessing,',
 '    }, true).then((session) => {',
 '      if (cancelled) session.cancel();',
 '      else capture = session;',
 '    }).catch((error) => {',
 '      if (!cancelled) handlers.onError(error instanceof Error ? error.message : "Tidak bisa membuka mikrofon.");',
 '    });',
 '    return {',
 '      stop: () => { cancelled = true; capture?.cancel(); },',
 '      needsManualFinish: false,',
 '    };',
 '  }',
 '  const Recognition =',
 '    (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;',
 ].join("\n"),
 "Call uses MediaRecorder and Railway Zipformer, no Chrome SpeechRecognition");

putFirstDuplicate(voice,
 '      onFinal: (text) => finishUtterance(text),\n      onSilence: () => listen(),\n      onError: (message) => setError(message),',
 [
 '      onFinal: (text) => finishUtterance(text),',
 '      onSilence: () => { setError("Belum terdengar ucapan. Tekan Coba lagi."); setCallState("idle"); },',
 '      onError: (message) => { setError(message); setCallState("idle"); },',
 '      onProcessing: () => { setCallState("transcribing"); },',
 ].join("\n"),
 "Call stops repeated mic failure loops and shows processing state");

put(voice,
 '      ? heard || "Listening…"\n      : callState === "thinking"',
 '      ? heard || "Listening…"\n      : callState === "transcribing"\n        ? "Mengubah suara menjadi teks…"\n      : callState === "thinking"',
 "Call displays transcription state");

putFirstDuplicate(voice,
 '          {needsManualFinish && callState === "listening" && (',
 [
 '          {callState === "idle" && live.current && (',
 '            <Button variant="secondary" onClick={() => { recogRef.current?.stop?.(); listen(); }}>',
 '              <Mic size={16} className="mr-1.5" /> Coba lagi',
 '            </Button>',
 '          )}',
 '          {needsManualFinish && callState === "listening" && (',
 ].join("\n"),
 "allow manual mic retry without closing Call");

put(voice,
 '  const beginCall = async () => {\n    // Request mic access from the actual click, before async lease claim.\n    if (!window.bloks && navigator.mediaDevices?.getUserMedia) {\n      try {\n        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });\n        stream.getTracks().forEach((track) => track.stop());\n      } catch {\n        // Call overlay reports any remaining microphone error.\n      }\n    }\n    setCalling(true);\n  };',
 '  const beginCall = async () => {\n    // CallOverlay will request and retain its own microphone stream.\n    setCalling(true);\n  };',
 "avoid opening and releasing microphone twice before Call");

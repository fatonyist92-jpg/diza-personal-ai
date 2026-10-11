// Inline ChatGPT device authorization inside Bloks > Settings > Engines > Codex.
// The existing owner-pairing cookie authorizes both endpoints.
// Passwords and API keys are never entered or stored in this component.
import { useEffect, useRef, useState } from "react";
import Check from "lucide-react/dist/esm/icons/check.mjs";
import Copy from "lucide-react/dist/esm/icons/copy.mjs";
import ExternalLink from "lucide-react/dist/esm/icons/external-link.mjs";
import Loader2 from "lucide-react/dist/esm/icons/loader-2.mjs";
import { Button } from "@/components/ui/button";

const DEVICE_LOGIN_URL = "https://auth.openai.com/codex/device";

type CodexAuthStatus = {
  installed?: boolean;
  authenticated?: boolean;
  state?: "idle" | "starting" | "waiting" | "connected" | "error";
  code?: string | null;
  expiresAt?: number | null;
  problem?: string | null;
  verifyUrl?: string | null;
};

async function fetchStatus(path: string, method: "GET" | "POST" = "GET"): Promise<CodexAuthStatus> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    let details = "";
    try {
      const payload = await response.json();
      if (typeof payload?.error === "string") details = payload.error;
    } catch { /* HTML or connection failure */ }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Akses login perlu pairing sebagai pemilik Bloks. Pairing ulang bila sesi sudah berakhir.");
    }
    throw new Error(details || "Server Codex tidak merespons (" + response.status + ").");
  }
  return (await response.json()) as CodexAuthStatus;
}

export function CodexWebviewAuth({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<CodexAuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLSpanElement | null>(null);
  const onChangedRef = useRef(onChanged);
  const wasAuthenticated = useRef(false);
  const active = useRef(true);
  const checking = useRef(false);
  onChangedRef.current = onChanged;

  const adopt = (next: CodexAuthStatus) => {
    if (!active.current) return;
    setStatus(next);
    setError(null);
    if (next.authenticated && !wasAuthenticated.current) {
      wasAuthenticated.current = true;
      onChangedRef.current();
    } else if (!next.authenticated) {
      wasAuthenticated.current = false;
    }
  };

  useEffect(() => {
    active.current = true;
    const refresh = async () => {
      if (checking.current) return;
      checking.current = true;
      try {
        adopt(await fetchStatus("/api/bloks-codex/status"));
      } catch (err) {
        if (active.current) setError(err instanceof Error ? err.message : "Koneksi gagal");
      } finally {
        checking.current = false;
      }
    };
    void refresh();
    // Code appears automatically as soon as Codex emits it, and completion
    // changes the engine state in-place without leaving the Settings page.
    const interval = setInterval(() => void refresh(), 3500);
    return () => {
      active.current = false;
      clearInterval(interval);
    };
  }, []);

  const begin = async () => {
    if (starting) return;
    setStarting(true);
    setCopied(false);
    setError(null);
    setStatus((previous) => ({ ...previous, state: "starting" }));
    try {
      adopt(await fetchStatus("/api/bloks-codex/start", "POST"));
    } catch (err) {
      if (active.current) setError(err instanceof Error ? err.message : "Gagal memulai autentikasi");
    } finally {
      if (active.current) setStarting(false);
    }
  };

  const copyCode = async () => {
    const code = status?.code;
    if (!code) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard not available");
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      const node = codeRef.current;
      if (!node) return;
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      setError("Kode disorot. Tekan dan tahan untuk menyalin.");
    }
  };

  const authenticated = status?.authenticated === true;
  const pending = status?.state === "starting" || status?.state === "waiting";
  const code = !authenticated ? status?.code : null;

  return (
    <div className="ml-10 mt-2.5 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-foreground">Autentikasi Codex · ChatGPT</span>
        <span className={authenticated ? "text-[11px] text-success" : "text-[11px] text-muted-foreground"}>
          {authenticated ? "✓ Terhubung" : !status ? "Memeriksa…" : pending ? "Menunggu login" : "Belum terhubung"}
        </span>
      </div>
      {authenticated ? (
        <div className="mt-2 flex items-center gap-2 text-[12px] text-success">
          <Check size={14} />
          Codex sudah login. Pilih Codex sebagai engine agent, lalu coba kirim pesan.
        </div>
      ) : (
        <>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
            Login menggunakan akun ChatGPT resmi. Tidak perlu API key.
            Kode akan muncul di sini otomatis setelah tombol ditekan.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            disabled={starting || pending}
            onClick={() => void begin()}
          >
            {starting || status?.state === "starting" ? <Loader2 size={13} className="animate-spin" /> : null}
            {pending ? "Menunggu autentikasi…" : status?.state === "error" ? "Buat kode baru" : "Buat kode autentikasi"}
          </Button>
          {code ? (
            <div className="mt-3 rounded-lg border bg-background p-3">
              <div className="mb-1 text-[11px] text-muted-foreground">Kode perangkat OpenAI</div>
              <div className="flex flex-wrap items-center gap-2">
                <span ref={codeRef} className="min-w-0 break-all font-mono text-[20px] font-semibold tracking-wider text-foreground" style={{ userSelect: "text" }}>
                  {code}
                </span>
                <Button size="sm" variant="secondary" onClick={() => void copyCode()}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Tersalin" : "Salin kode"}
                </Button>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                Masukkan kode ini di halaman resmi OpenAI. Status login diperiksa otomatis.
              </div>
            </div>
          ) : pending ? (
            <div className="mt-2 text-[11px] text-muted-foreground">
              {status?.state === "starting" ? "Meminta kode dari OpenAI…" : "Menunggu persetujuan akun ChatGPT…"}
            </div>
          ) : null}
          <a
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground no-underline"
            href={DEVICE_LOGIN_URL}
            rel="noreferrer"
          >
            <ExternalLink size={13} />
            Buka OpenAI untuk login
          </a>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Setelah kode tersalin, buka OpenAI. Jika WebView tidak dapat membuka login, salin link ke Chrome.
            Kembali ke Settings → Engines untuk melihat status yang diperbarui otomatis.
          </p>
        </>
      )}
      {(status?.problem || error) && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-warning" role="alert">
          {error || status?.problem}
        </p>
      )}
    </div>
  );
}

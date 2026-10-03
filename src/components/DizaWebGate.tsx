import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import Loader2 from "lucide-react/dist/esm/icons/loader-2.mjs";
import LockKeyhole from "lucide-react/dist/esm/icons/lock-keyhole.mjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Session = { enabled: boolean; authenticated: boolean };

export function DizaWebGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    try {
      const res = await fetch("/api/diza/session", { credentials: "same-origin" });
      // Vite-only development has no harness route. Preserve upstream dev
      // behavior instead of making the UI depend on this optional gate.
      if (res.status === 404) return setSession({ enabled: false, authenticated: true });
      const body = (await res.json()) as Session;
      setSession(body);
    } catch {
      setSession({ enabled: false, authenticated: true });
    }
  };

  useEffect(() => {
    void check();
  }, []);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/diza/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Password tidak cocok.");
      }
      setPassword("");
      await check();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login gagal.");
    } finally {
      setBusy(false);
    }
  };

  if (!session) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-foreground">
        <Loader2 size={22} className="animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session.enabled || session.authenticated) return <>{children}</>;

  return (
    <div className="flex h-dvh items-center justify-center bg-background px-5 text-foreground">
      <form onSubmit={login} className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <LockKeyhole size={18} />
        </div>
        <div className="mt-4 text-[17px] font-semibold tracking-tight">DIZA AI PERSONAL ASSISTANT</div>
        <div className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          Masukkan password pribadi untuk membuka workspace Diza.
        </div>
        <Input
          autoFocus
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          className="mt-4"
        />
        <Button type="submit" className="mt-3 w-full" disabled={!password || busy}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {busy ? "Membuka…" : "Buka DIZA"}
        </Button>
        {error && <div className="mt-2 text-[12px] text-destructive">{error}</div>}
      </form>
    </div>
  );
}

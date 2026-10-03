import { useEffect } from "react";

export const INTRO_KEY = "diza-intro-v2";
export const INTRO_PLUGINS_KEY = "bloks-intro-plugins";

export function introPending(): boolean {
  try {
    return !localStorage.getItem(INTRO_KEY);
  } catch {
    return false;
  }
}

export function Intro({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(INTRO_KEY, String(Date.now()));
      } catch {}
      onDone();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="diza-intro fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#07080b] text-white">
      <div className="diza-intro-grid absolute inset-0" />
      <div className="diza-intro-orb diza-intro-orb-a" />
      <div className="diza-intro-orb diza-intro-orb-b" />

      <div className="relative z-10 flex w-full max-w-[520px] flex-col items-center px-7 text-center">
        <div className="diza-intro-mark relative flex size-[92px] items-center justify-center rounded-[28px] border border-white/15 bg-white/[0.055] shadow-2xl">
          <div className="absolute inset-[7px] rounded-[22px] border border-white/8" />
          <span className="diza-intro-d text-[42px] font-black tracking-[-0.08em]">D</span>
        </div>

        <div className="diza-intro-title mt-7 text-[31px] font-bold tracking-[-0.04em] sm:text-[36px]">
          DIZA AI
        </div>
        <div className="diza-intro-sub mt-1.5 text-[12px] font-semibold tracking-[0.28em] text-white/60 sm:text-[13px]">
          PERSONAL ASSISTANT
        </div>

        <div className="diza-intro-rule mt-7 h-px w-[150px] overflow-hidden bg-white/10">
          <div className="diza-intro-rule-run h-full w-1/2 bg-white/80" />
        </div>

        <div className="diza-intro-status mt-4 text-[11.5px] tracking-[0.08em] text-white/42">
          INTELLIGENCE · MEMORY · AGENTS
        </div>
      </div>

      <div className="absolute bottom-[max(22px,env(safe-area-inset-bottom))] left-1/2 w-[min(280px,70vw)] -translate-x-1/2">
        <div className="h-[2px] overflow-hidden rounded-full bg-white/10">
          <div className="diza-intro-progress h-full rounded-full bg-white/75" />
        </div>
      </div>
    </div>
  );
}

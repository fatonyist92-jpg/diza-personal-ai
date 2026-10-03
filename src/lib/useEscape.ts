// Escape closes the thing on top, and only that.
//
// Every panel used to add its own window listener, and some never did, so
// Escape either did nothing or closed two layers at once (a panel and the
// Settings page under it). One listener and a stack: the most recently
// opened surface that asked for Escape gets it. A Radix menu, popover or
// dialog handles its own Escape and is left to it.
import { useEffect, useRef } from "react";

const stack: Array<{ current: () => void }> = [];

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  if (document.querySelector('[role=menu], [role=dialog][data-state="open"], [data-radix-popper-content-wrapper]')) {
    return;
  }
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  top.current();
}

if (typeof window !== "undefined") window.addEventListener("keydown", onKey);

export function useEscape(close: () => void, enabled = true) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!enabled) return;
    stack.push(latest);
    return () => {
      const at = stack.lastIndexOf(latest);
      if (at >= 0) stack.splice(at, 1);
    };
  }, [enabled]);
}

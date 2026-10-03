// Watchers: when something changes, an agent does something about it.
//
// A routine runs on a clock, a webhook needs somebody to wire a service
// to it. A watcher needs a sentence: "when a new invoice lands in this
// folder, file it", "tell me when this page changes", "when this feed has
// a new post, summarise it". Three kinds of thing can be watched, all
// from this machine, nothing through anybody's cloud:
//
//   a folder     files added, changed or removed (a snapshot of names,
//                sizes and times, compared on each look)
//   a web page   its readable text, compared on each look, optionally
//                only when it mentions something
//   a feed       RSS or Atom; new entries since the last look
//
// When one changes, the agent gets a turn that says what changed and
// what it was asked to do about it, in a lane of the watcher's own, or as
// a rehearsal when the watcher was set to try things on a copy first.
//
// Three limits keep a watcher from becoming a way to spend money in a
// loop: a first look only takes a baseline and never fires, a watcher
// fires at most once per quiet period and a few times an hour, and a
// folder change made by the watcher's own agent while it works is not a
// change to react to.
import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type WatchKind = "folder" | "page" | "feed";

export interface Watcher {
  id: string;
  botId: string;
  name: string;
  kind: WatchKind;
  /** A folder path, or an http(s) URL. */
  target: string;
  /** What the agent should do when it changes. */
  instruction: string;
  /** Pages only: fire only when the new text mentions this. */
  mentions?: string;
  /** Act in the real folder, or rehearse on a copy first. */
  mode: "act" | "rehearse";
  /** Minutes between looks, for pages and feeds. */
  every: number;
  enabled: boolean;
  createdAt: number;
  /** What the last look saw, to compare the next one with. */
  seen?: string;
  seenItems?: string[];
  lastCheck?: number;
  lastError?: string;
  laneId?: string;
  fires: Array<{ at: number; summary: string }>;
}

export const MIN_EVERY = 5;
export const MAX_EVERY = 24 * 60;
/** No more than this many turns an hour from one watcher. */
export const FIRES_PER_HOUR = 6;
/** A folder has to be still this long before its changes count. */
export const SETTLE_MS = 20_000;
const MAX_FILES = 3_000;
const SKIP = new Set(["node_modules", ".git", ".DS_Store", "dist", "build", ".next", ".cache", "__pycache__"]);

// ── folders ────────────────────────────────────────────────────────────

/** name -> "size:mtime" for every file under `dir`, capped. */
export function folderSnapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  let count = 0;
  const walk = (at: string, depth: number) => {
    if (depth > 6 || count >= MAX_FILES) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (count >= MAX_FILES) return;
      if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
      const full = join(at, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile()) {
        try {
          const st = statSync(full);
          out[relative(dir, full)] = `${st.size}:${Math.round(st.mtimeMs)}`;
          count++;
        } catch {
          /* gone between listing and looking */
        }
      }
    }
  };
  walk(dir, 0);
  return out;
}

export function folderChanges(before: Record<string, string>, after: Record<string, string>) {
  const added = Object.keys(after).filter((f) => !(f in before));
  const removed = Object.keys(before).filter((f) => !(f in after));
  const changed = Object.keys(after).filter((f) => f in before && before[f] !== after[f]);
  return { added, removed, changed };
}

export function describeFolderChanges(c: ReturnType<typeof folderChanges>): string | null {
  const list = (label: string, files: string[]) =>
    files.length ? `${label}: ${files.slice(0, 15).join(", ")}${files.length > 15 ? `, and ${files.length - 15} more` : ""}` : null;
  const lines = [list("New", c.added), list("Changed", c.changed), list("Removed", c.removed)].filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

// ── pages ──────────────────────────────────────────────────────────────

/** The words a person reads on a page: no scripts, styles or tags. */
export function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export const hashOf = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 32);

/** Lines on the page now that were not there before, which is what a
 * person means by "what changed". */
export function newLines(before: string, after: string, max = 20): string[] {
  const had = new Set(before.split("\n"));
  return after
    .split("\n")
    .filter((line) => line.length > 2 && !had.has(line))
    .slice(0, max);
}

// ── feeds ──────────────────────────────────────────────────────────────

export interface FeedItem {
  id: string;
  title: string;
  link?: string;
}

const tag = (xml: string, name: string) => {
  const found = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return found ? found[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim() : "";
};

/** RSS <item>s and Atom <entry>s, newest first as the feed lists them. */
export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const [, block] of xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)) {
    const atomLink = block.match(/<link[^>]*href="([^"]+)"/i)?.[1];
    const link = atomLink ?? (tag(block, "link") || undefined);
    const title = tag(block, "title") || "(untitled)";
    const id = tag(block, "guid") || tag(block, "id") || link || title;
    items.push({ id, title: title.slice(0, 200), ...(link ? { link } : {}) });
    if (items.length >= 100) break;
  }
  return items;
}

// ── firing ─────────────────────────────────────────────────────────────

/** Whether the watcher may start another turn now. */
export function mayFire(w: Pick<Watcher, "fires">, now: number): boolean {
  return w.fires.filter((f) => now - f.at < 60 * 60 * 1000).length < FIRES_PER_HOUR;
}

/** What the agent is told. */
export function watcherTurn(w: Pick<Watcher, "kind" | "target" | "instruction" | "name">, what: string): string {
  const where = w.kind === "folder" ? `the folder ${w.target}` : w.kind === "feed" ? `the feed ${w.target}` : `the page ${w.target}`;
  return [
    `Your watcher "${w.name}" noticed a change in ${where}.`,
    "",
    "What changed:",
    what,
    "",
    `What you were asked to do when this happens: ${w.instruction}`,
    "",
    "If this change does not call for that, say so in one line and stop.",
  ].join("\n");
}

export function cleanWatcher(raw: Record<string, unknown>, botExists: (id: string) => boolean):
  | { ok: true; value: Pick<Watcher, "botId" | "name" | "kind" | "target" | "instruction" | "mentions" | "mode" | "every" | "enabled"> }
  | { ok: false; error: string } {
  const kind = raw.kind;
  if (kind !== "folder" && kind !== "page" && kind !== "feed") return { ok: false, error: "kind is folder, page or feed" };
  const botId = typeof raw.botId === "string" ? raw.botId : "";
  if (!botExists(botId)) return { ok: false, error: "no such agent" };
  const target = String(raw.target ?? "").trim();
  if (kind === "folder") {
    if (!target.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(target)) return { ok: false, error: "a folder is a full path" };
  } else if (!/^https?:\/\/[^\s]+$/i.test(target)) {
    return { ok: false, error: "a page or feed is an http or https address" };
  }
  const instruction = String(raw.instruction ?? "").trim().slice(0, 1_000);
  if (!instruction) return { ok: false, error: "say what the agent should do when it changes" };
  const every = Math.min(MAX_EVERY, Math.max(MIN_EVERY, Math.round(Number(raw.every) || 30)));
  const mentions = String(raw.mentions ?? "").trim().slice(0, 120);
  return {
    ok: true,
    value: {
      botId,
      kind,
      target: target.slice(0, 1_000),
      name: (String(raw.name ?? "").trim() || target.split(/[\\/]/).filter(Boolean).pop() || kind).slice(0, 60),
      instruction,
      ...(mentions && kind === "page" ? { mentions } : {}),
      mode: raw.mode === "rehearse" ? "rehearse" : "act",
      every,
      enabled: raw.enabled !== false,
    },
  };
}

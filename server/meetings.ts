// Meeting notes: an agent listens in, writes it up, and hands out the work.
//
// The listening happens on the Mac (electron/resources/speech-helper.swift,
// meeting mode): the microphone is "you", and the Mac's own sound, the
// other side of a Zoom or Meet call, is "them". Nothing joins the call as
// a bot and nothing is recorded: what arrives here is text, a segment at
// each pause.
//
// When the meeting ends, the agent chosen to take notes gets a turn with
// the transcript and writes a summary, the decisions, and action items,
// one per line with an owner. An owner that is one of your agents can be
// handed its item with one press; nothing is handed out on its own.
//
// Everything here is pure; the server keeps the meetings.

export interface Segment {
  at: number;
  who: "you" | "them";
  text: string;
}

export interface ActionItem {
  owner: string;
  /** Set when the owner is one of the agents. */
  botId?: string;
  text: string;
  sentAt?: number;
}

export interface Meeting {
  id: string;
  botId: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  segments: Segment[];
  laneId?: string;
  items?: ActionItem[];
  /** Whether the Mac's own sound was being heard. */
  system: boolean;
}

export const MAX_SEGMENTS = 4_000;
const MAX_TRANSCRIPT = 120_000;

/** The transcript as the note-taker reads it: a line per turn of speech,
 * consecutive segments from the same side joined. */
export function transcriptOf(segments: Segment[], names: { you: string; them: string } = { you: "You", them: "Them" }): string {
  const lines: string[] = [];
  let last: Segment["who"] | null = null;
  for (const s of segments) {
    const text = s.text.trim();
    if (!text) continue;
    if (s.who === last) lines[lines.length - 1] += ` ${text}`;
    else lines.push(`${s.who === "you" ? names.you : names.them}: ${text}`);
    last = s.who;
  }
  const all = lines.join("\n");
  // a very long meeting keeps its end, where the decisions usually are
  return all.length > MAX_TRANSCRIPT ? `(earlier part of the meeting left out)\n${all.slice(-MAX_TRANSCRIPT)}` : all;
}

export function notesPrompt(meeting: Pick<Meeting, "title" | "startedAt" | "endedAt" | "system">, transcript: string, team: string[], person: string): string {
  const minutes = meeting.endedAt ? Math.max(1, Math.round((meeting.endedAt - meeting.startedAt) / 60_000)) : null;
  return [
    `You took notes in a meeting${meeting.title ? ` called "${meeting.title}"` : ""}${minutes ? `, about ${minutes} minutes long` : ""}.`,
    meeting.system
      ? `"${person}" is the person you work for, heard through their microphone; "Them" is everyone else on the call.`
      : `"${person}" is the person you work for; others in the room may be in their lines too.`,
    "The transcript is machine speech recognition, so expect mistakes in names and numbers.",
    "",
    "Write it up in this shape, and nothing else:",
    "",
    "## Summary",
    "Three to six bullets on what the meeting was about and where it landed.",
    "",
    "## Decisions",
    "Bullets, or \"None\".",
    "",
    "## Action items",
    `One per line as "- Owner: the task". The owner is ${person}, someone else from the call by name, or one of these agents when the task is theirs to do: ${team.join(", ") || "none"}.`,
    "",
    "The transcript:",
    "",
    transcript || "(nothing was heard)",
  ].join("\n");
}

/** Action items out of the notes: "- Owner: task" lines under the
 * Action items heading, owners matched to agents by name. */
export function actionItems(notes: string, agents: Array<{ id: string; name: string }>): ActionItem[] {
  const section = notes.split(/^#{1,6}\s*Action items\s*$/im)[1] ?? "";
  const body = section.split(/^#{1,6}\s/m)[0];
  const items: ActionItem[] = [];
  for (const line of body.split("\n")) {
    const found = line.match(/^\s*[-*]\s*(?:\[ ?\]\s*)?\**([^:*]{1,60}?)\**\s*:\s*(.+)$/);
    if (!found) continue;
    const owner = found[1].trim();
    const agent = agents.find((a) => a.name.toLowerCase() === owner.toLowerCase());
    items.push({ owner, text: found[2].trim().slice(0, 500), ...(agent ? { botId: agent.id } : {}) });
    if (items.length >= 30) break;
  }
  return items;
}

/** A segment as sent by the app, checked. */
export function cleanSegment(raw: unknown, now = Date.now()): Segment | null {
  const s = (raw ?? {}) as Record<string, unknown>;
  const text = String(s.text ?? "").replace(/\s+/g, " ").trim().slice(0, 4_000);
  if (!text) return null;
  const who = s.who === "them" ? "them" : "you";
  const at = Number.isFinite(Number(s.at)) ? Number(s.at) : now;
  return { at, who, text };
}

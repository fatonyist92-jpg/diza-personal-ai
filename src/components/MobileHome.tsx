import { useMemo, useState } from "react";
import Activity from "lucide-react/dist/esm/icons/activity.mjs";
import Brain from "lucide-react/dist/esm/icons/brain.mjs";
import CalendarClock from "lucide-react/dist/esm/icons/calendar-clock.mjs";
import FolderKanban from "lucide-react/dist/esm/icons/folder-kanban.mjs";
import MoreVertical from "lucide-react/dist/esm/icons/more-vertical.mjs";
import Plus from "lucide-react/dist/esm/icons/plus.mjs";
import Puzzle from "lucide-react/dist/esm/icons/puzzle.mjs";
import Search from "lucide-react/dist/esm/icons/search.mjs";
import Settings from "lucide-react/dist/esm/icons/settings-2.mjs";
import Sparkles from "lucide-react/dist/esm/icons/sparkles.mjs";
import Users from "lucide-react/dist/esm/icons/users.mjs";
import { AgentAvatar } from "./Avatar";
import { formatWhen, useStore, type Blok, type Bot } from "@/state/store";
import { previewLine } from "@/lib/preview";
import { cn } from "@/lib/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Tab = "agents" | "rooms";

function botLastAt(bot: Bot): number {
  return bot.messages.at(-1)?.at ?? bot.tasks?.[0]?.lastAt ?? bot.tasks?.[0]?.createdAt ?? 0;
}

function roomLastAt(room: Blok): number {
  return room.messages.at(-1)?.at ?? room.createdAt;
}

function AgentRow({ bot, onOpen }: { bot: Bot; onOpen: () => void }) {
  const last = bot.messages.at(-1);
  const preview = bot.busy
    ? "Sedang bekerja…"
    : bot.tasks?.some((task) => task.state === "needs-you")
      ? "Menunggu kamu…"
      : last
        ? previewLine(last)
        : bot.title || "Belum ada percakapan";
  const at = botLastAt(bot);

  return (
    <button
      onClick={onOpen}
      className="group flex w-full items-center gap-3.5 border-b border-border/70 px-4 py-3 text-left transition-colors active:bg-accent/80"
    >
      <div className="relative shrink-0">
        <AgentAvatar bot={bot} size={48} />
        {bot.busy && (
          <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background bg-success" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold text-foreground">{bot.name}</span>
          {at > 0 && (
            <span className={cn("shrink-0 text-[11px] tabular-nums", bot.unread ? "text-brand-ink" : "text-muted-foreground")}>
              {formatWhen(at)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-[13px]", bot.unread ? "font-medium text-foreground" : "text-muted-foreground")}>
            {preview}
          </span>
          {bot.unread && <span className="size-2.5 shrink-0 rounded-full bg-brand" />}
        </div>
      </div>
    </button>
  );
}

function RoomAvatar({ room, bots }: { room: Blok; bots: Bot[] }) {
  const members = room.memberIds.map((id) => bots.find((bot) => bot.id === id)).filter(Boolean) as Bot[];
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
      {members.length ? (
        <div className="flex -space-x-2">
          {members.slice(0, 3).map((bot) => (
            <AgentAvatar key={bot.id} bot={bot} size={22} className="ring-2 ring-muted" />
          ))}
        </div>
      ) : (
        <Users size={20} className="text-muted-foreground" />
      )}
    </div>
  );
}

function RoomRow({ room, bots, onOpen }: { room: Blok; bots: Bot[]; onOpen: () => void }) {
  const last = room.messages.at(-1);
  const members = room.memberIds.map((id) => bots.find((bot) => bot.id === id)).filter(Boolean) as Bot[];
  const working = members.filter((bot) => bot.busy);
  const preview = working.length
    ? `${working.map((bot) => bot.name).join(", ")} sedang bekerja…`
    : last
      ? previewLine(last)
      : members.map((bot) => bot.name).join(", ") || "Room kosong";
  const at = roomLastAt(room);

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3.5 border-b border-border/70 px-4 py-3 text-left transition-colors active:bg-accent/80"
    >
      <RoomAvatar room={room} bots={bots} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold text-foreground">{room.name}</span>
          {at > 0 && <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatWhen(at)}</span>}
        </div>
        <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{preview}</div>
      </div>
    </button>
  );
}

export function MobileHome({ onOpen }: { onOpen: (id: string) => void }) {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<Tab>("agents");
  const [query, setQuery] = useState("");

  const bots = useMemo(
    () =>
      state.bots
        .filter((bot) => !bot.hidden)
        .filter((bot) => !query.trim() || `${bot.name} ${bot.title}`.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || botLastAt(b) - botLastAt(a)),
    [state.bots, query],
  );

  const rooms = useMemo(
    () =>
      state.bloks
        .filter((room) => !room.archived)
        .filter((room) => !query.trim() || room.name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => roomLastAt(b) - roomLastAt(a)),
    [state.bloks, query],
  );

  const create = () =>
    dispatch(tab === "agents" ? { type: "toggleNewAgent", open: true } : { type: "toggleNewRoom", open: true });

  return (
    <main className="flex h-full min-h-0 w-full flex-col bg-background md:hidden">
      <header className="shrink-0 border-b bg-background">
        <div className="flex h-[60px] items-center gap-2 px-4">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[19px] font-bold tracking-[-0.025em] text-foreground">DIZA AI</div>
            <div className="text-[10.5px] font-medium tracking-[0.12em] text-muted-foreground">PERSONAL ASSISTANT</div>
          </div>
          <button
            onClick={create}
            className="flex size-9 items-center justify-center rounded-full text-foreground transition-colors active:bg-accent"
            aria-label={tab === "agents" ? "Agent baru" : "Room baru"}
          >
            <Plus size={20} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex size-9 items-center justify-center rounded-full text-foreground transition-colors active:bg-accent" aria-label="Menu">
                <MoreVertical size={19} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[210px]">
              <DropdownMenuItem onClick={() => dispatch({ type: "toggleNewAgent", open: true })}>Agent baru</DropdownMenuItem>
              <DropdownMenuItem onClick={() => dispatch({ type: "toggleNewRoom", open: true })}>Room baru</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => dispatch({ type: "toggleActivity", open: true })}><Activity />Activity</DropdownMenuItem>
              <DropdownMenuItem onClick={() => dispatch({ type: "toggleProjects", open: true })}><FolderKanban />Projects</DropdownMenuItem>
              <DropdownMenuItem onClick={() => dispatch({ type: "toggleMemory", open: true, botId: null })}><Brain />Memory</DropdownMenuItem>
              <DropdownMenuItem onClick={() => dispatch({ type: "toggleRoutines", open: true })}><CalendarClock />Routines</DropdownMenuItem>
              <DropdownMenuItem onClick={() => dispatch({ type: "toggleSkills", open: true })}><Sparkles />Skills</DropdownMenuItem>
              <DropdownMenuItem onClick={() => dispatch({ type: "togglePlugins", open: true })}><Puzzle />Plugins</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => dispatch({ type: "toggleAppSettings", open: true })}><Settings />Settings</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
            <Search size={15} className="shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tab === "agents" ? "Cari agent" : "Cari room"}
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 px-4">
          {(["agents", "rooms"] as const).map((value) => (
            <button
              key={value}
              onClick={() => {
                setTab(value);
                setQuery("");
              }}
              className={cn(
                "relative h-11 text-[13px] font-semibold transition-colors",
                tab === value ? "text-brand-ink" : "text-muted-foreground",
              )}
            >
              {value === "agents" ? `Agents (${state.bots.filter((bot) => !bot.hidden).length})` : `Rooms (${state.bloks.filter((room) => !room.archived).length})`}
              {tab === value && <span className="absolute inset-x-7 bottom-0 h-0.5 rounded-full bg-brand" />}
            </button>
          ))}
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto">
        {tab === "agents" ? (
          bots.length ? (
            bots.map((bot) => <AgentRow key={bot.id} bot={bot} onOpen={() => onOpen(bot.id)} />)
          ) : (
            <div className="px-8 py-16 text-center text-[13px] text-muted-foreground">
              {query ? "Agent tidak ditemukan." : "Belum ada agent. Tekan + untuk membuat agent."}
            </div>
          )
        ) : rooms.length ? (
          rooms.map((room) => <RoomRow key={room.id} room={room} bots={state.bots} onOpen={() => onOpen(room.id)} />)
        ) : (
          <div className="px-8 py-16 text-center text-[13px] text-muted-foreground">
            {query ? "Room tidak ditemukan." : "Belum ada room. Tekan + untuk membuat room."}
          </div>
        )}
      </section>
    </main>
  );
}

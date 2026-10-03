import { useMemo, useState } from "react";
import Plus from "lucide-react/dist/esm/icons/plus.mjs";
import Search from "lucide-react/dist/esm/icons/search.mjs";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal.mjs";
import Users from "lucide-react/dist/esm/icons/users.mjs";
import { AgentAvatar } from "./Avatar";
import { formatWhen, useStore, type Blok, type Bot } from "@/state/store";
import { previewLine } from "@/lib/preview";
import { cn } from "@/lib/cn";
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
      <header
        className="shrink-0 border-b bg-background"
        style={{ paddingTop: "max(14px, env(safe-area-inset-top))" }}
      >
        <div className="flex h-[58px] items-center gap-2 px-4">
          <div className="min-w-0 flex-1 truncate text-[29px] font-semibold tracking-[-0.035em] text-foreground">
            Obrolan
          </div>
          <button
            onClick={create}
            className="flex size-11 items-center justify-center rounded-full text-foreground transition-colors active:bg-accent"
            aria-label={tab === "agents" ? "Buat agen baru" : "Buat ruang baru"}
          >
            <Plus size={27} strokeWidth={1.8} />
          </button>
          <button
            onClick={() => dispatch({ type: "toggleAppSettings", open: true })}
            className="flex size-11 items-center justify-center rounded-full text-foreground transition-colors active:bg-accent"
            aria-label="Pengaturan"
          >
            <SlidersHorizontal size={24} strokeWidth={1.9} />
          </button>
        </div>

        <div className="grid grid-cols-2 px-5">
          <button
            onClick={() => {
              setTab("agents");
              setQuery("");
            }}
            className={cn(
              "relative h-12 text-[17px] font-medium transition-colors",
              tab === "agents" ? "text-foreground" : "text-muted-foreground",
            )}
          >
            Agen
            {tab === "agents" && <span className="absolute inset-x-8 bottom-0 h-[2px] rounded-full bg-foreground/75" />}
          </button>
          <button
            onClick={() => {
              setTab("rooms");
              setQuery("");
            }}
            className={cn(
              "relative h-12 text-[17px] font-medium transition-colors",
              tab === "rooms" ? "text-foreground" : "text-muted-foreground",
            )}
          >
            Ruang
            {tab === "rooms" && <span className="absolute inset-x-8 bottom-0 h-[2px] rounded-full bg-foreground/75" />}
          </button>
        </div>

        <div className="px-4 pb-3 pt-3">
          <div className="flex items-center gap-3 rounded-[24px] bg-muted/85 px-4 py-3">
            <Search size={20} className="shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tab === "agents" ? "Cari agen" : "Cari ruang"}
              className="min-w-0 flex-1 bg-transparent text-[17px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto">
        {tab === "agents" ? (
          bots.length ? (
            bots.map((bot) => <AgentRow key={bot.id} bot={bot} onOpen={() => onOpen(bot.id)} />)
          ) : (
            <div className="px-8 py-16 text-center text-[13px] text-muted-foreground">
              {query ? "Agen tidak ditemukan." : "Belum ada agen. Tekan + untuk membuat agen."}
            </div>
          )
        ) : rooms.length ? (
          rooms.map((room) => <RoomRow key={room.id} room={room} bots={state.bots} onOpen={() => onOpen(room.id)} />)
        ) : (
          <div className="px-8 py-16 text-center text-[13px] text-muted-foreground">
            {query ? "Ruang tidak ditemukan." : "Belum ada ruang. Tekan + untuk membuat ruang."}
          </div>
        )}
      </section>
    </main>
  );
}

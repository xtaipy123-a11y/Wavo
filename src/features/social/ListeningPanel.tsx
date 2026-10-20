import { useState } from "react";
import { LuCheck, LuChevronDown, LuChevronUp, LuHeadphones, LuLogOut, LuSearch, LuSkipForward, LuUserPlus, LuX } from "react-icons/lu";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useSearchTracks } from "@/features/search/hooks/useSearchTracks";
import { useTranslation } from "@/languages";
import type { SocialProfile } from "./socialClient";
import { listeningClient, type ListeningRoom } from "./listeningClient";
import { canRequestListeningAction, listeningError, useListeningStore } from "./listeningStore";

interface ListeningPanelProps {
  friends: { id: string; profile?: SocialProfile }[];
}

export default function ListeningPanel({ friends }: ListeningPanelProps) {
  const { locale } = useTranslation();
  const de = locale === "de";
  const userId = useAuthStore((state) => state.user?.id);
  const { room, members, invitations, error, start, invite, join, decline, leave, refresh } = useListeningStore();
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const host = room?.host_id === userId;
  const ownMember = members.find((member) => member.user_id === userId);
  const canAdd = canRequestListeningAction(room, ownMember, userId, "add");
  const canSkip = canRequestListeningAction(room, ownMember, userId, "skip");
  const canMove = canRequestListeningAction(room, ownMember, userId, "move");
  const { tracks, loading: searching } = useSearchTracks(search, { enabled: canAdd, limit: 8 });
  const queue = Array.isArray(room?.queue_snapshot) ? room.queue_snapshot.filter((item) =>
    item && typeof item.id === "string" && typeof item.title === "string" && Number.isInteger(item.index)).slice(0, 50) : [];
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); }
    catch (cause) { useListeningStore.setState({ error: listeningError(cause) }); }
    finally { setBusy(false); }
  };
  const name = (id: string) => id === userId ? (de ? "Du" : "You") :
    friends.find((friend) => friend.id === id)?.profile?.display_name ?? "Wavo";
  const setPermission = (key: "allow_guest_add" | "allow_guest_skip" | "allow_guest_reorder", value: boolean) => {
    if (!room) return;
    const permissions: Pick<ListeningRoom, "allow_guest_add" | "allow_guest_skip" | "allow_guest_reorder"> = {
      allow_guest_add: room.allow_guest_add, allow_guest_skip: room.allow_guest_skip,
      allow_guest_reorder: room.allow_guest_reorder, [key]: value,
    };
    void run(async () => { await listeningClient.setPermissions(room.id, permissions); await refresh(); });
  };
  const request = (kind: "add" | "skip" | "move", options?: { trackId?: string; fromIndex?: number; toIndex?: number }) => {
    if (room) void run(() => listeningClient.request(room.id, kind, options));
  };

  return (
    <section className="wavo-listening-panel mb-[16px] rounded-[16px] border border-accent/25 bg-gradient-to-r from-accent/15 via-bg-secondary/90 to-bg-secondary/70 p-[16px]">
      <div className="flex flex-wrap items-center gap-[12px]">
        <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-accent/20 text-accent"><LuHeadphones size={21} /></span>
        <div className="min-w-[180px] flex-1">
          <h2 className="m-0 text-[15px] font-semibold">{de ? "Zusammen hören" : "Listen together"}</h2>
          <p className="m-0 text-[12px] text-text-secondary">{room
            ? host ? (de ? "Du steuerst die Musik für alle." : "You control the music for everyone.") : (de ? `Du hörst bei ${name(room.host_id)} mit.` : `Listening with ${name(room.host_id)}.`)
            : (de ? "Starte eine Hörsession und lade mehrere Freunde ein." : "Start a listening session and invite multiple friends.")}</p>
        </div>
        {room ? <button type="button" disabled={busy} onClick={() => void run(leave)} className="flex items-center gap-[7px] rounded-[9px] border border-border-alpha-15 px-[11px] py-[8px] text-[12px] font-semibold hover:bg-white/10 disabled:opacity-40"><LuLogOut size={15} />{host ? (de ? "Beenden" : "End") : (de ? "Verlassen" : "Leave")}</button>
          : <button type="button" disabled={busy} onClick={() => void run(start)} className="rounded-[9px] bg-accent px-[13px] py-[8px] text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-40">{de ? "Hörsession starten" : "Start listening session"}</button>}
      </div>
      {room && <div className="wavo-listening-grid mt-[13px] grid gap-[12px] border-t border-border-alpha-15 pt-[12px]">
        <div className="space-y-[12px]">
          <div className="rounded-[12px] border border-border-alpha-15 bg-bg-primary/50 p-[12px]">
            <div className="flex items-center justify-between gap-[9px]"><div><p className="m-0 text-[10px] font-semibold uppercase tracking-[.12em] text-text-tertiary">{de ? "Läuft gerade" : "Now playing"}</p><p className="mb-0 mt-[4px] text-[14px] font-semibold">{room.track_title || (de ? "Noch kein Song" : "No song yet")}</p></div>{canSkip && <button type="button" disabled={busy || !room.track_id} onClick={() => request("skip")} title={de ? "Überspringen" : "Skip"} className="rounded-[8px] border border-border-alpha-15 p-[8px] hover:bg-white/10 disabled:opacity-40"><LuSkipForward size={17} /></button>}</div>
            <div className="mt-[10px] flex flex-wrap gap-[7px]">{members.map((member) => <span key={member.user_id} className={`rounded-full px-[10px] py-[5px] text-[11px] ${member.status === "active" ? "bg-accent/20 text-text-primary" : "bg-white/5 text-text-tertiary"}`}>{name(member.user_id)}{member.status === "invited" ? (de ? " · eingeladen" : " · invited") : ""}</span>)}</div>
          </div>
          <div className="rounded-[12px] border border-border-alpha-15 bg-bg-primary/50 p-[12px]">
            <h3 className="m-0 text-[13px] font-semibold">{de ? "Als Nächstes" : "Up next"} <span className="text-text-tertiary">· {queue.length}</span></h3>
            <div className="mt-[8px] max-h-[200px] space-y-[4px] overflow-y-auto">{queue.length ? queue.map((item, i) => <div key={`${item.index}-${item.id}`} className="flex items-center gap-[8px] rounded-[7px] bg-white/[0.04] px-[8px] py-[6px]"><span className="w-[17px] text-[11px] text-text-tertiary">{i + 1}</span><div className="min-w-0 flex-1"><p className="m-0 truncate text-[12px] font-medium">{item.title}</p><p className="m-0 truncate text-[10px] text-text-tertiary">{item.artists}</p></div>{canMove && <div className="flex"><button type="button" disabled={busy || i === 0} onClick={() => request("move", { fromIndex: item.index, toIndex: queue[i - 1].index })} title={de ? "Nach oben" : "Move up"} className="rounded p-[4px] hover:bg-white/10 disabled:opacity-30"><LuChevronUp size={14} /></button><button type="button" disabled={busy || i === queue.length - 1} onClick={() => request("move", { fromIndex: item.index, toIndex: queue[i + 1].index })} title={de ? "Nach unten" : "Move down"} className="rounded p-[4px] hover:bg-white/10 disabled:opacity-30"><LuChevronDown size={14} /></button></div>}</div>) : <p className="m-0 py-[8px] text-[12px] text-text-tertiary">{de ? "Warteschlange leer" : "Queue empty"}</p>}</div>
          </div>
        </div>
        <div className="space-y-[12px]">
          {host && <div className="rounded-[12px] border border-border-alpha-15 bg-bg-primary/50 p-[12px]"><h3 className="m-0 text-[13px] font-semibold">{de ? "Rechte für Gäste" : "Guest permissions"}</h3>{([["allow_guest_add", de ? "Songs hinzufügen" : "Add songs"], ["allow_guest_skip", de ? "Songs überspringen" : "Skip songs"], ["allow_guest_reorder", de ? "Warteschlange sortieren" : "Reorder queue"]] as const).map(([key, label]) => <label key={key} className="flex cursor-pointer items-center justify-between gap-[8px] py-[6px] text-[12px]"><span>{label}</span><input type="checkbox" checked={room[key]} disabled={busy} onChange={(event) => setPermission(key, event.target.checked)} className="accent-accent" /></label>)}</div>}
          {host && members.filter((member) => member.status === "active" && member.user_id !== userId).length > 0 && <div className="rounded-[12px] border border-border-alpha-15 bg-bg-primary/50 p-[12px]"><h3 className="m-0 text-[13px] font-semibold">{de ? "Rechte pro Person" : "Permissions per person"}</h3><p className="mb-[8px] mt-[3px] text-[11px] text-text-tertiary">{de ? "Standard übernimmt die Regeln für alle Gäste." : "Default follows the rules for all guests."}</p>{members.filter((member) => member.status === "active" && member.user_id !== userId).map((member) => <div key={member.user_id} className="border-t border-border-alpha-15 py-[7px]"><p className="m-0 text-[12px] font-semibold">{name(member.user_id)}</p><div className="mt-[5px] flex flex-wrap gap-[6px]">{([["can_add", de ? "Hinzufügen" : "Add"], ["can_skip", de ? "Überspringen" : "Skip"], ["can_reorder", de ? "Sortieren" : "Reorder"]] as const).map(([key, label]) => <label key={key} className="flex items-center gap-[4px] text-[10px] text-text-secondary"><span>{label}</span><select value={member[key] === null ? "default" : member[key] ? "allow" : "deny"} disabled={busy} onChange={(event) => void run(async () => { await listeningClient.setMemberPermission(room.id, member.user_id, key, event.target.value === "default" ? null : event.target.value === "allow"); await refresh(); })} className="rounded border border-border-alpha-15 bg-bg-secondary px-[4px] py-[3px] text-[10px] text-text-primary"><option value="default">{de ? "Standard" : "Default"}</option><option value="allow">{de ? "Ja" : "Allow"}</option><option value="deny">{de ? "Nein" : "Deny"}</option></select></label>)}</div></div>)}</div>}
          {canAdd && <div className="rounded-[12px] border border-border-alpha-15 bg-bg-primary/50 p-[12px]"><h3 className="m-0 text-[13px] font-semibold">{de ? "Song hinzufügen" : "Add a song"}</h3><label className="mt-[8px] flex items-center gap-[7px] rounded-[8px] border border-border-alpha-15 bg-bg-secondary px-[9px] py-[7px]"><LuSearch size={14} className="text-text-tertiary" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={de ? "Song suchen …" : "Search songs …"} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" /></label>{search.trim().length >= 2 && <div className="mt-[7px] max-h-[190px] space-y-[3px] overflow-y-auto">{searching && <p className="text-[11px] text-text-tertiary">{de ? "Suche …" : "Searching …"}</p>}{tracks.slice(0, 8).map((track) => <button key={track.id} type="button" disabled={busy} onClick={() => { if (room) void run(async () => { await listeningClient.request(room.id, "add", { trackId: track.id }); setSearch(""); }); }} className="flex w-full items-center gap-[8px] rounded-[7px] px-[7px] py-[6px] text-left hover:bg-white/10 disabled:opacity-40"><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-medium">{track.title}</span><span className="block truncate text-[10px] text-text-tertiary">{track.artists}</span></span><LuUserPlus size={15} className="text-accent" /></button>)}</div>}</div>}
          {host && <div className="rounded-[12px] border border-border-alpha-15 bg-bg-primary/50 p-[12px]"><h3 className="m-0 text-[13px] font-semibold">{de ? "Freunde einladen" : "Invite friends"}</h3><div className="mt-[8px] flex flex-wrap gap-[6px]">{friends.filter((friend) => !members.some((member) => member.user_id === friend.id)).map((friend) => <button key={friend.id} type="button" disabled={busy} onClick={() => void run(() => invite(friend.id))} className="flex items-center gap-[6px] rounded-[8px] border border-border-alpha-15 bg-bg-primary/60 px-[9px] py-[6px] text-[11px] hover:bg-white/10 disabled:opacity-40"><LuUserPlus size={13} />{friend.profile?.display_name ?? "Wavo"}</button>)}{!friends.length && <span className="text-[11px] text-text-tertiary">{de ? "Füge Freunde hinzu, um sie einzuladen." : "Add friends to invite them."}</span>}</div></div>}
        </div>
      </div>}
      {invitations.length > 0 && <div className="mt-[13px] space-y-[7px] border-t border-border-alpha-15 pt-[12px]">
        {invitations.map(({ room: invitedRoom }) => <div key={invitedRoom.id} className="flex flex-wrap items-center gap-[8px] rounded-[9px] bg-bg-primary/50 px-[10px] py-[8px] text-[12px]"><span className="min-w-0 flex-1">{de ? `${name(invitedRoom.host_id)} lädt dich zum gemeinsamen Hören ein.` : `${name(invitedRoom.host_id)} invited you to listen together.`}</span><button type="button" disabled={busy} onClick={() => void run(() => join(invitedRoom.id))} className="flex items-center gap-[5px] rounded-[7px] bg-accent px-[9px] py-[5px] font-semibold text-white disabled:opacity-40"><LuCheck size={13} />{de ? "Beitreten" : "Join"}</button><button type="button" disabled={busy} onClick={() => void run(() => decline(invitedRoom.id))} title={de ? "Ablehnen" : "Decline"} className="rounded-[7px] p-[6px] hover:bg-white/10"><LuX size={14} /></button></div>)}
      </div>}
      {error && <p role="alert" className="mb-0 mt-[12px] text-[12px] text-red-300">{error}</p>}
    </section>
  );
}

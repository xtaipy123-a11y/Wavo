import { useState } from "react";
import { LuCheck, LuHeadphones, LuLogOut, LuUserPlus, LuX } from "react-icons/lu";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useTranslation } from "@/languages";
import type { SocialProfile } from "./socialClient";
import { listeningError, useListeningStore } from "./listeningStore";

interface ListeningPanelProps {
  friends: { id: string; profile?: SocialProfile }[];
}

export default function ListeningPanel({ friends }: ListeningPanelProps) {
  const { locale } = useTranslation();
  const de = locale === "de";
  const userId = useAuthStore((state) => state.user?.id);
  const { room, members, invitations, error, start, invite, join, decline, leave } = useListeningStore();
  const [busy, setBusy] = useState(false);
  const host = room?.host_id === userId;
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); }
    catch (cause) { useListeningStore.setState({ error: listeningError(cause) }); }
    finally { setBusy(false); }
  };
  const name = (id: string) => id === userId ? (de ? "Du" : "You") :
    friends.find((friend) => friend.id === id)?.profile?.display_name ?? "Wavo";

  return (
    <section className="mb-[16px] rounded-[16px] border border-accent/25 bg-gradient-to-r from-accent/15 via-bg-secondary/90 to-bg-secondary/70 p-[16px]">
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
      {room && <div className="mt-[13px] border-t border-border-alpha-15 pt-[12px]">
        <p className="m-0 text-[12px] text-text-secondary">{room.track_title || (de ? "Wähle einen Song zum gemeinsamen Hören." : "Choose a song to listen together.")}</p>
        <div className="mt-[10px] flex flex-wrap gap-[7px]">
          {members.map((member) => <span key={member.user_id} className={`rounded-full px-[10px] py-[5px] text-[11px] ${member.status === "active" ? "bg-accent/20 text-text-primary" : "bg-white/5 text-text-tertiary"}`}>{name(member.user_id)}{member.status === "invited" ? (de ? " · eingeladen" : " · invited") : ""}</span>)}
        </div>
        {host && <div className="mt-[13px] flex flex-wrap gap-[7px]">
          {friends.filter((friend) => !members.some((member) => member.user_id === friend.id)).map((friend) => <button key={friend.id} type="button" disabled={busy} onClick={() => void run(() => invite(friend.id))} className="flex items-center gap-[6px] rounded-[8px] border border-border-alpha-15 bg-bg-primary/60 px-[9px] py-[6px] text-[11px] hover:bg-white/10 disabled:opacity-40"><LuUserPlus size={13} />{friend.profile?.display_name ?? "Wavo"}</button>)}
          {!friends.length && <span className="text-[11px] text-text-tertiary">{de ? "Füge zuerst Freunde hinzu, um sie einzuladen." : "Add friends to invite them."}</span>}
        </div>}
      </div>}
      {invitations.length > 0 && <div className="mt-[13px] space-y-[7px] border-t border-border-alpha-15 pt-[12px]">
        {invitations.map(({ room: invitedRoom }) => <div key={invitedRoom.id} className="flex flex-wrap items-center gap-[8px] rounded-[9px] bg-bg-primary/50 px-[10px] py-[8px] text-[12px]"><span className="min-w-0 flex-1">{de ? `${name(invitedRoom.host_id)} lädt dich zum gemeinsamen Hören ein.` : `${name(invitedRoom.host_id)} invited you to listen together.`}</span><button type="button" disabled={busy} onClick={() => void run(() => join(invitedRoom.id))} className="flex items-center gap-[5px] rounded-[7px] bg-accent px-[9px] py-[5px] font-semibold text-white disabled:opacity-40"><LuCheck size={13} />{de ? "Beitreten" : "Join"}</button><button type="button" disabled={busy} onClick={() => void run(() => decline(invitedRoom.id))} title={de ? "Ablehnen" : "Decline"} className="rounded-[7px] p-[6px] hover:bg-white/10"><LuX size={14} /></button></div>)}
      </div>}
      {error && <p role="alert" className="mb-0 mt-[12px] text-[12px] text-red-300">{error}</p>}
    </section>
  );
}

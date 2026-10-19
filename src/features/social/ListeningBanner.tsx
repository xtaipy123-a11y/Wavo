import { useState } from "react";
import { Link } from "react-router-dom";
import { LuCheck, LuHeadphones, LuX } from "react-icons/lu";
import { useTranslation } from "@/languages";
import { useAuthStore } from "@/features/auth/store/authStore";
import { listeningError, useListeningStore } from "./listeningStore";

export default function ListeningBanner() {
  const { locale } = useTranslation();
  const de = locale === "de";
  const userId = useAuthStore((state) => state.user?.id);
  const { room, members, invitations, join, decline } = useListeningStore();
  const [busy, setBusy] = useState(false);
  const invitation = invitations[0];
  if (!room && !invitation) return null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); }
    catch (cause) { useListeningStore.setState({ error: listeningError(cause) }); }
    finally { setBusy(false); }
  };

  return <div className="relative z-[54] flex min-h-[38px] shrink-0 items-center gap-[10px] rounded-[10px] border border-accent/25 bg-bg-secondary px-[12px] py-[6px] text-[11px] text-text-primary" data-no-window-drag>
    <LuHeadphones size={16} className="shrink-0 text-accent" />
    {invitation ? <>
      <span className="min-w-0 flex-1 truncate">{de ? "Ein Freund lädt dich zum gemeinsamen Hören ein." : "A friend invited you to listen together."}</span>
      <button type="button" disabled={busy} onClick={() => void run(() => join(invitation.room.id))} className="flex items-center gap-[5px] rounded-[7px] bg-accent px-[9px] py-[5px] font-semibold text-white disabled:opacity-40"><LuCheck size={13} />{de ? "Beitreten" : "Join"}</button>
      <button type="button" disabled={busy} onClick={() => void run(() => decline(invitation.room.id))} title={de ? "Ablehnen" : "Decline"} className="rounded-[7px] p-[5px] hover:bg-white/10"><LuX size={14} /></button>
    </> : <>
      <span className="min-w-0 flex-1 truncate">{de ? "Zusammen hören" : "Listen together"} · {members.filter((member) => member.status === "active").length} {de ? "Teilnehmer" : "participants"} · {room?.host_id === userId ? (de ? "Du steuerst" : "You control") : (de ? "Host steuert" : "Host controls")}</span>
      <Link to="/friends" className="rounded-[7px] px-[8px] py-[4px] font-semibold text-accent hover:bg-white/10">{de ? "Anzeigen" : "View"}</Link>
    </>}
  </div>;
}

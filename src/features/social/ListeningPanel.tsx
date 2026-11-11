import { useEffect, useState } from "react";
import { LuArrowUpRight, LuCheck, LuChevronDown, LuChevronUp, LuCrown, LuHeadphones, LuLogOut, LuMusic2, LuRadio, LuSearch, LuSkipForward, LuUserPlus, LuX } from "react-icons/lu";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useSearchTracks } from "@/features/search/hooks/useSearchTracks";
import { useTranslation } from "@/languages";
import type { SocialProfile } from "./socialClient";
import { listeningClient, type ListeningRoom } from "./listeningClient";
import { canRequestListeningAction, listeningError, useListeningStore } from "./listeningStore";
import { getSupabaseClient } from "@/shared/supabase/client";
import type { ListeningVote } from "./listeningClient";

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
  const [votes, setVotes] = useState<ListeningVote[]>([]);
  useEffect(() => {
    if (!room?.id) { setVotes([]); return; }
    let active = true;
    const refreshVotes = () => { void listeningClient.votes(room.id).then((rows) => { if (active) setVotes(rows); }).catch(() => {}); };
    refreshVotes();
    const client = getSupabaseClient();
    const channel = client.channel(`wavo-votes-${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wavo_listening_votes", filter: `room_id=eq.${room.id}` }, refreshVotes)
      .subscribe();
    return () => { active = false; void client.removeChannel(channel); };
  }, [room?.id]);
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
  const initial = (id: string) => name(id).trim().slice(0, 1).toUpperCase() || "W";
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
  const activeMembers = members.filter((member) => member.status === "active");

  return (
    <section className="wavo-listening-panel wavo-social-feature" data-active={Boolean(room)}>
      {!room ? (
        <div className="wavo-listen-idle">
          <div className="wavo-listen-idle-copy">
            <div className="wavo-listen-topline">
              <span className="wavo-feature-icon"><LuHeadphones size={22} /></span>
              <span className="wavo-feature-kicker">{de ? "GLEICHER SONG. GLEICHER MOMENT." : "SAME SONG. SAME MOMENT."}</span>
              <span className="wavo-listen-live-chip"><i />{de ? "Live" : "Live"}</span>
            </div>
            <h2>{de ? "Zusammen hören" : "Listen together"}</h2>
            <p>{de ? "Starte eine Hörsession und lade mehrere Freunde ein. Alle hören denselben Song – synchron und gemeinsam." : "Start a listening session and invite multiple friends. Everyone hears the same song – in sync, together."}</p>
            <div className="wavo-listen-idle-actions">
              <button type="button" disabled={busy} onClick={() => void run(start)} className="wavo-feature-action">
                <LuRadio size={16} />{de ? "Hörsession starten" : "Start a session"}<LuArrowUpRight size={15} />
              </button>
              <div className="wavo-listen-people">
                <div className="wavo-listen-people-stack">
                  {friends.slice(0, 4).map((friend) => <span key={friend.id} title={friend.profile?.display_name ?? "Wavo"}>{initial(friend.id)}</span>)}
                  {!friends.length && <span className="is-empty"><LuUserPlus size={12} /></span>}
                </div>
                <span>{friends.length
                  ? (de ? `${Math.min(friends.length, 4)}${friends.length > 4 ? "+" : ""} Freunde können mithören` : `${Math.min(friends.length, 4)}${friends.length > 4 ? "+" : ""} friends can join`)
                  : (de ? "Lade Freunde ein" : "Invite friends")}</span>
              </div>
            </div>
          </div>
          <div className="wavo-listen-idle-visual" aria-hidden="true">
            <div className="wavo-listen-rings"><i /><i /><i /></div>
            <div className="wavo-listen-disc"><span><LuHeadphones size={32} /></span></div>
            <div className="wavo-listen-wave">{Array.from({ length: 9 }).map((_, index) => <i key={index} />)}</div>
            <span className="wavo-listen-note"><LuMusic2 size={15} /></span>
            <span className="wavo-listen-spark">✦</span>
          </div>
        </div>
      ) : (
        <>
          <header className="wavo-listen-active-head">
            <span className="wavo-feature-icon"><LuHeadphones size={22} /></span>
            <div className="wavo-listen-active-title">
              <span className="wavo-listen-live"><i />{de ? "SESSION AKTIV" : "SESSION ACTIVE"}</span>
              <h2>{de ? "Zusammen hören" : "Listen together"}</h2>
              <p>{host
                ? (de ? "Du steuerst die Musik für alle." : "You control the music for everyone.")
                : (de ? `Du hörst bei ${name(room.host_id)} mit.` : `Listening with ${name(room.host_id)}.`)}</p>
            </div>
            <div className="wavo-listen-active-people">
              <div className="wavo-listen-people-stack">
                {members.slice(0, 4).map((member) => <span key={member.user_id} title={`${name(member.user_id)}${member.status === "invited" ? (de ? " · eingeladen" : " · invited") : ""}`} className={member.status === "invited" ? "is-invited" : ""}>{initial(member.user_id)}</span>)}
              </div>
              <span>{activeMembers.length} {de ? "aktiv" : "active"}</span>
            </div>
            <button type="button" disabled={busy} onClick={() => void run(leave)} className="wavo-listen-leave">
              <LuLogOut size={15} />{host ? (de ? "Beenden" : "End") : (de ? "Verlassen" : "Leave")}
            </button>
          </header>
          <div className="wavo-listening-grid">
            <div className="wavo-listen-column">
              <div className="wavo-now-playing">
                <div className={`wavo-now-disc ${room.is_playing ? "is-playing" : ""}`}>
                  <span><LuHeadphones size={24} /></span>
                </div>
                <div className="wavo-now-copy">
                  <p className="wavo-card-kicker">{de ? "Läuft gerade" : "Now playing"}</p>
                  <p className="wavo-now-title">{room.track_title || (de ? "Noch kein Song" : "No song yet")}</p>
                  <p className="wavo-now-hint">{room.is_playing ? (de ? "Synchron mit allen Teilnehmern" : "In sync with everyone") : (de ? "Pausiert" : "Paused")}</p>
                </div>
                {canSkip && <button type="button" disabled={busy || !room.track_id} onClick={() => request("skip")} title={de ? "Überspringen" : "Skip"} className="wavo-listen-icon-button"><LuSkipForward size={17} /></button>}
                <div className="wavo-now-equalizer" data-paused={room.is_playing ? undefined : "true"} aria-hidden="true">{Array.from({ length: 4 }).map((_, index) => <i key={index} />)}</div>
              </div>
              <div className="wavo-listen-card">
                <div className="wavo-card-head">
                  <h3>{de ? "Als Nächstes" : "Up next"}<span>{queue.length}</span></h3>
                </div>
                <div className="wavo-queue">
                  {queue.length ? queue.map((item, i) => (
                    <div key={`${item.index}-${item.id}`} className="wavo-queue-row">
                      <span className="wavo-queue-index">{String(i + 1).padStart(2, "0")}</span>
                      <div className="wavo-queue-copy">
                        <p>{item.title}</p>
                        <p>{item.artists}</p>
                      </div>
                      {canMove && <div className="wavo-queue-move">
                        <button type="button" disabled={busy || i === 0} onClick={() => request("move", { fromIndex: item.index, toIndex: queue[i - 1].index })} title={de ? "Nach oben" : "Move up"}><LuChevronUp size={14} /></button>
                        <button type="button" disabled={busy || i === queue.length - 1} onClick={() => request("move", { fromIndex: item.index, toIndex: queue[i + 1].index })} title={de ? "Nach unten" : "Move down"}><LuChevronDown size={14} /></button>
                      </div>}
                    </div>
                  )) : <div className="wavo-queue-empty"><LuMusic2 size={18} /><p>{de ? "Noch keine Songs in der Warteschlange." : "No songs in the queue yet."}</p></div>}
                </div>
                {queue.length > 0 && <div className="wavo-vote-block">
                  <p>{de ? "Stimme für den nächsten Song ab" : "Vote for the next song"}</p>
                  <div className="wavo-vote-row">{queue.map((item) => {
                    const count = votes.filter((vote) => vote.track_id === item.id).length;
                    const own = votes.some((vote) => vote.track_id === item.id && vote.voter_id === userId);
                    return <button key={item.id} type="button" disabled={busy} onClick={() => void run(async () => {
                      await listeningClient.toggleVote(room.id, item.id, own);
                      setVotes(await listeningClient.votes(room.id));
                    })} className={own ? "is-voted" : ""} title={item.title}>
                      <span>{item.title}</span><span>{count > 0 ? `♥ ${count}` : "♥"}</span>
                    </button>;
                  })}</div>
                </div>}
              </div>
            </div>
            <div className="wavo-listen-column">
              {host && <div className="wavo-listen-card">
                <div className="wavo-card-head"><span className="wavo-card-icon"><LuCrown size={15} /></span><h3>{de ? "Rechte für Gäste" : "Guest permissions"}</h3></div>
                <div className="wavo-permissions">
                  {([["allow_guest_add", de ? "Songs hinzufügen" : "Add songs"], ["allow_guest_skip", de ? "Songs überspringen" : "Skip songs"], ["allow_guest_reorder", de ? "Warteschlange sortieren" : "Reorder queue"]] as const).map(([key, label]) => (
                    <label key={key} className="wavo-permission-row">
                      <span>{label}</span>
                      <input type="checkbox" checked={room[key]} disabled={busy} onChange={(event) => setPermission(key, event.target.checked)} className="accent-accent-primary" />
                    </label>
                  ))}
                </div>
              </div>}
              {host && activeMembers.some((member) => member.user_id !== userId) && <div className="wavo-listen-card">
                <div className="wavo-card-head"><h3>{de ? "Rechte pro Person" : "Permissions per person"}</h3></div>
                <p className="wavo-card-hint">{de ? "Standard übernimmt die Regeln für alle Gäste." : "Default follows the rules for all guests."}</p>
                {activeMembers.filter((member) => member.user_id !== userId).map((member) => (
                  <div key={member.user_id} className="wavo-person-permission">
                    <p>{name(member.user_id)}</p>
                    <div className="wavo-person-permission-grid">
                      {([["can_add", de ? "Hinzufügen" : "Add"], ["can_skip", de ? "Überspringen" : "Skip"], ["can_reorder", de ? "Sortieren" : "Reorder"]] as const).map(([key, label]) => (
                        <label key={key}>
                          <span>{label}</span>
                          <select value={member[key] === null ? "default" : member[key] ? "allow" : "deny"} disabled={busy} onChange={(event) => void run(async () => { await listeningClient.setMemberPermission(room.id, member.user_id, key, event.target.value === "default" ? null : event.target.value === "allow"); await refresh(); })}>
                            <option value="default">{de ? "Standard" : "Default"}</option>
                            <option value="allow">{de ? "Ja" : "Allow"}</option>
                            <option value="deny">{de ? "Nein" : "Deny"}</option>
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>}
              {canAdd && <div className="wavo-listen-card">
                <div className="wavo-card-head"><h3>{de ? "Song hinzufügen" : "Add a song"}</h3></div>
                <label className="wavo-listen-search">
                  <LuSearch size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={de ? "Song suchen …" : "Search songs …"} />
                </label>
                {search.trim().length >= 2 && <div className="wavo-listen-results">
                  {searching && <p className="wavo-card-hint">{de ? "Suche …" : "Searching …"}</p>}
                  {tracks.slice(0, 8).map((track) => (
                    <button key={track.id} type="button" disabled={busy} onClick={() => { if (room) void run(async () => { await listeningClient.request(room.id, "add", { trackId: track.id }); setSearch(""); }); }}>
                      <span><span>{track.title}</span><span>{track.artists}</span></span><LuUserPlus size={15} />
                    </button>
                  ))}
                </div>}
              </div>}
              {host && <div className="wavo-listen-card">
                <div className="wavo-card-head"><h3>{de ? "Freunde einladen" : "Invite friends"}</h3></div>
                <div className="wavo-invite-row">
                  {friends.filter((friend) => !members.some((member) => member.user_id === friend.id)).map((friend) => (
                    <button key={friend.id} type="button" disabled={busy} onClick={() => void run(() => invite(friend.id))}>
                      <span className="wavo-invite-avatar">{initial(friend.id)}</span>
                      {friend.profile?.display_name ?? "Wavo"}
                      <LuUserPlus size={13} />
                    </button>
                  ))}
                  {!friends.length && <span className="wavo-card-hint">{de ? "Füge Freunde hinzu, um sie einzuladen." : "Add friends to invite them."}</span>}
                </div>
              </div>}
            </div>
          </div>
        </>
      )}
      {invitations.length > 0 && <div className="wavo-listen-invitations">
        {invitations.map(({ room: invitedRoom }) => (
          <div key={invitedRoom.id} className="wavo-listen-invitation">
            <span className="wavo-invite-avatar">{initial(invitedRoom.host_id)}</span>
            <span>{de ? `${name(invitedRoom.host_id)} lädt dich zum gemeinsamen Hören ein.` : `${name(invitedRoom.host_id)} invited you to listen together.`}</span>
            <button type="button" disabled={busy} onClick={() => void run(() => join(invitedRoom.id))} className="wavo-listen-join"><LuCheck size={13} />{de ? "Beitreten" : "Join"}</button>
            <button type="button" disabled={busy} onClick={() => void run(() => decline(invitedRoom.id))} title={de ? "Ablehnen" : "Decline"} className="wavo-listen-icon-button"><LuX size={14} /></button>
          </div>
        ))}
      </div>}
      {error && <p role="alert" className="wavo-listen-error">{error}</p>}
    </section>
  );
}

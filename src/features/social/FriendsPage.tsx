import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { LuCheck, LuDownload, LuMusic2, LuSearch, LuSend, LuUserPlus, LuUsers, LuX } from "react-icons/lu";
import { api } from "@/shared/api";
import { getSupabaseClient } from "@/shared/supabase/client";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useToast } from "@/shared/ui";
import { useTranslation } from "@/languages";
import { parseSharedPlaylist, socialClient, type Friendship, type SocialMessage, type SocialProfile } from "./socialClient";

const copy = {
  de: {
    title: "Freunde", subtitle: "Musik zusammen entdecken", search: "Nutzername suchen", noFriends: "Noch keine Freunde. Suche nach einem Nutzernamen und sende eine Anfrage.",
    requests: "Anfragen", friends: "Freunde", add: "Anfrage senden", pending: "Anfrage gesendet", accept: "Annehmen", decline: "Ablehnen", remove: "Entfernen", you: "Du", sent: "Warte auf Antwort", chatEmpty: "Schreib deinem Freund eine Nachricht oder teile eine Playlist.",
    select: "Wähle einen Freund zum Schreiben", message: "Nachricht schreiben …", send: "Senden", share: "Playlist teilen", shareHint: "Wähle einen Freund und sende die Playlist als Kopie.", import: "In meine Bibliothek importieren", imported: "Playlist importiert", messageSent: "Gesendet", searchEmpty: "Keine Nutzer gefunden", error: "Social-Datenbank noch nicht eingerichtet oder nicht erreichbar.",
  },
  en: {
    title: "Friends", subtitle: "Discover music together", search: "Search username", noFriends: "No friends yet. Search for a username and send a request.",
    requests: "Requests", friends: "Friends", add: "Send request", pending: "Request sent", accept: "Accept", decline: "Decline", remove: "Remove", you: "You", sent: "Waiting for reply", chatEmpty: "Write a message or share a playlist with your friend.",
    select: "Choose a friend to chat", message: "Write a message …", send: "Send", share: "Share playlist", shareHint: "Choose a friend and send a copy of the playlist.", import: "Import to my library", imported: "Playlist imported", messageSent: "Sent", searchEmpty: "No users found", error: "The social database is not set up or is unavailable.",
  },
};

function initials(profile?: SocialProfile): string {
  return (profile?.display_name || profile?.username || "?").slice(0, 2).toUpperCase();
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function FriendsPage() {
  const { locale } = useTranslation();
  const c = locale === "de" ? copy.de : copy.en;
  const me = useAuthStore((state) => state.user?.id);
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const sharePlaylistId = params.get("sharePlaylist");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SocialProfile[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Record<string, SocialProfile>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareTitle, setShareTitle] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const loadFriends = useCallback(async () => {
    try {
      const rows = await socialClient.listFriendships();
      const ids = [...new Set(rows.map((row) => row.requester_id === me ? row.addressee_id : row.requester_id))];
      const people = await socialClient.profiles(ids);
      setFriendships(rows);
      setProfiles(Object.fromEntries(people.map((person) => [person.user_id, person])));
      setError("");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, [me]);

  useEffect(() => {
    if (!me) return;
    void loadFriends();
    const timer = window.setInterval(() => void loadFriends(), 15000);
    const supabase = getSupabaseClient();
    const channel = supabase.channel(`wavo-friends-${me}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wavo_friendships" }, () => void loadFriends())
      .subscribe();
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [me, loadFriends]);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    let alive = true;
    const timer = window.setTimeout(() => {
      void socialClient.searchProfiles(search).then((items) => { if (alive) setResults(items); }).catch((cause) => { if (alive) setError(errorText(cause)); });
    }, 250);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [search]);

  const loadMessages = useCallback(async (friendId: string) => {
    try { setMessages(await socialClient.messages(friendId)); setError(""); }
    catch (cause) { setError(errorText(cause)); }
  }, []);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    void loadMessages(selectedId);
    const timer = window.setInterval(() => void loadMessages(selectedId), 7000);
    const supabase = getSupabaseClient();
    const channel = supabase.channel(`wavo-chat-${me}-${selectedId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wavo_messages" }, (event) => {
        const row = event.new as Partial<SocialMessage>;
        if ((row.sender_id === me && row.recipient_id === selectedId) || (row.sender_id === selectedId && row.recipient_id === me)) void loadMessages(selectedId);
      })
      .subscribe();
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [selectedId, me, loadMessages]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages.length, selectedId]);

  useEffect(() => {
    if (!sharePlaylistId) { setShareTitle(""); return; }
    let alive = true;
    void api.getUserPlaylist(sharePlaylistId).then(({ playlist }) => { if (alive) setShareTitle(playlist.title); }).catch((cause) => { if (alive) setError(errorText(cause)); });
    return () => { alive = false; };
  }, [sharePlaylistId]);

  const accepted = useMemo(() => friendships.filter((row) => row.status === "accepted"), [friendships]);
  const incoming = useMemo(() => friendships.filter((row) => row.status === "pending" && row.addressee_id === me), [friendships, me]);
  const outgoing = useMemo(() => friendships.filter((row) => row.status === "pending" && row.requester_id === me), [friendships, me]);
  const selectedProfile = selectedId ? profiles[selectedId] : undefined;

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); await loadFriends(); setError(""); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || (!draft.trim() && !sharePlaylistId) || busy) return;
    setBusy(true);
    try {
      let playlist;
      if (sharePlaylistId) {
        const detail = await api.getUserPlaylist(sharePlaylistId);
        playlist = parseSharedPlaylist({
          title: detail.playlist.title,
          description: detail.playlist.description,
          tracks: detail.items.map((item) => item.track),
        });
        if (!playlist) throw new Error("Die Playlist ist zu groß oder enthält ungültige Titel.");
      }
      await socialClient.sendMessage(selectedId, draft, playlist ?? undefined);
      setDraft("");
      if (sharePlaylistId) setParams({}, { replace: true });
      await loadMessages(selectedId);
      toast(c.messageSent, "checkmark");
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  const importPlaylist = async (message: SocialMessage) => {
    const snapshot = parseSharedPlaylist(message.playlist_snapshot);
    if (!snapshot) { setError("Invalid playlist snapshot."); return; }
    await act(async () => {
      const created = await api.createPlaylist({ title: snapshot.title, description: snapshot.description });
      await api.addPlaylistTrackSnapshots(created.id, snapshot.tracks);
      window.dispatchEvent(new Event("library:changed"));
      toast(c.imported, "checkmark", { description: snapshot.title });
    });
  };

  const personId = (row: Friendship) => row.requester_id === me ? row.addressee_id : row.requester_id;
  const existingIds = new Set(friendships.flatMap((row) => [row.requester_id, row.addressee_id]));

  return (
    <div className="min-h-full px-[24px] py-[28px] text-text-primary" data-no-window-drag>
      <div className="mx-auto max-w-[1250px]">
        <div className="mb-[24px] flex items-center gap-[14px]">
          <div className="flex h-[44px] w-[44px] items-center justify-center rounded-[14px] bg-accent/20 text-accent"><LuUsers size={23} /></div>
          <div><h1 className="m-0 text-[27px] font-bold">{c.title}</h1><p className="m-0 text-[13px] text-text-tertiary">{c.subtitle}</p></div>
        </div>
        {error && <div role="alert" className="mb-[16px] rounded-[12px] border border-red-400/30 bg-red-500/10 px-[14px] py-[10px] text-[13px] text-red-300">{c.error} {error}</div>}
        <div className="grid min-h-[580px] grid-cols-1 gap-[12px] lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="rounded-[16px] border border-border-alpha-15 bg-bg-secondary/70 p-[14px]">
            <label className="flex items-center gap-[8px] rounded-[10px] border border-border-alpha-15 bg-bg-primary px-[12px] py-[9px] text-text-tertiary">
              <LuSearch size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={c.search} aria-label={c.search} className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-text-primary outline-none" />
            </label>
            {search.trim() && <div className="mt-[14px]"><p className="mb-[7px] text-[11px] font-semibold uppercase tracking-[.12em] text-text-tertiary">{c.search}</p>{results.length ? results.map((person) => <div key={person.user_id} className="flex items-center gap-[9px] rounded-[9px] px-[5px] py-[8px]"><Avatar profile={person} /><div className="min-w-0 flex-1"><p className="m-0 truncate text-[13px] font-semibold">{person.display_name}</p><p className="m-0 truncate text-[11px] text-text-tertiary">@{person.username}</p></div><button type="button" disabled={busy || existingIds.has(person.user_id)} onClick={() => void act(() => socialClient.requestFriend(person.user_id))} aria-label={`${c.add}: ${person.username}`} title={existingIds.has(person.user_id) ? c.pending : c.add} className="rounded-[8px] p-[7px] text-text-secondary hover:bg-white/10 disabled:opacity-35"><LuUserPlus size={17} /></button></div>) : <p className="text-[12px] text-text-tertiary">{c.searchEmpty}</p>}</div>}
            {incoming.length > 0 && <section className="mt-[22px]"><h2 className="mb-[8px] text-[12px] font-semibold uppercase tracking-[.12em] text-text-tertiary">{c.requests} · {incoming.length}</h2>{incoming.map((row) => <div key={row.id} className="flex items-center gap-[9px] py-[7px]"><Avatar profile={profiles[row.requester_id]} /><span className="min-w-0 flex-1 truncate text-[13px]">{profiles[row.requester_id]?.display_name ?? "Wavo"}</span><button type="button" title={c.accept} disabled={busy} onClick={() => void act(() => socialClient.acceptFriend(row.id))} className="rounded-[7px] p-[6px] text-green-400 hover:bg-white/10"><LuCheck size={17} /></button><button type="button" title={c.decline} disabled={busy} onClick={() => void act(() => socialClient.removeFriend(row.id))} className="rounded-[7px] p-[6px] text-text-tertiary hover:bg-white/10"><LuX size={17} /></button></div>)}</section>}
            <section className="mt-[22px]"><h2 className="mb-[8px] text-[12px] font-semibold uppercase tracking-[.12em] text-text-tertiary">{c.friends} · {accepted.length}</h2>{loading ? <p className="text-[12px] text-text-tertiary">…</p> : accepted.length ? accepted.map((row) => { const id = personId(row); const profile = profiles[id]; return <button key={row.id} type="button" onClick={() => setSelectedId(id)} className={`flex w-full items-center gap-[10px] rounded-[10px] px-[8px] py-[9px] text-left hover:bg-white/8 ${selectedId === id ? "bg-white/10" : ""}`}><Avatar profile={profile} /><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{profile?.display_name ?? "Wavo"}</span><span className="block truncate text-[11px] text-text-tertiary">@{profile?.username ?? "…"}</span></span></button>; }) : <p className="text-[12px] leading-[1.5] text-text-tertiary">{c.noFriends}</p>}</section>
            {outgoing.length > 0 && <section className="mt-[22px]"><h2 className="mb-[8px] text-[12px] font-semibold uppercase tracking-[.12em] text-text-tertiary">{c.sent}</h2>{outgoing.map((row) => <div key={row.id} className="flex items-center gap-[9px] py-[7px]"><Avatar profile={profiles[row.addressee_id]} /><span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary">{profiles[row.addressee_id]?.display_name ?? "Wavo"}</span><button type="button" title={c.remove} disabled={busy} onClick={() => void act(() => socialClient.removeFriend(row.id))} className="p-[5px] text-text-tertiary hover:text-text-primary"><LuX size={15} /></button></div>)}</section>}
          </aside>
          <section className="flex min-h-[580px] flex-col overflow-hidden rounded-[16px] border border-border-alpha-15 bg-bg-secondary/70">
            {selectedId && accepted.some((row) => personId(row) === selectedId) ? <>
              <header className="flex items-center gap-[11px] border-b border-border-alpha-15 px-[18px] py-[13px]"><Avatar profile={selectedProfile} /><div className="min-w-0 flex-1"><h2 className="m-0 truncate text-[15px] font-semibold">{selectedProfile?.display_name ?? "Wavo"}</h2><p className="m-0 text-[11px] text-text-tertiary">@{selectedProfile?.username ?? "…"}</p></div><button type="button" title={c.remove} disabled={busy} onClick={() => void act(async () => { const row = accepted.find((item) => personId(item) === selectedId); if (row) await socialClient.removeFriend(row.id); setSelectedId(null); })} className="p-[6px] text-text-tertiary hover:text-text-primary"><LuX size={17} /></button></header>
              <div className="flex-1 space-y-[12px] overflow-y-auto px-[18px] py-[20px]" style={{ minHeight: 360, maxHeight: "calc(100vh - 350px)" }}>
                {!messages.length && <div className="flex h-full min-h-[260px] items-center justify-center text-center text-[13px] text-text-tertiary">{c.chatEmpty}</div>}
                {messages.map((message) => { const mine = message.sender_id === me; const snapshot = parseSharedPlaylist(message.playlist_snapshot); return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[80%] rounded-[14px] px-[13px] py-[10px] text-[13px] leading-[1.5] ${mine ? "bg-accent/25" : "bg-bg-primary"}`}>{message.body && <p className="m-0 whitespace-pre-wrap break-words">{message.body}</p>}{snapshot && <div className={`${message.body ? "mt-[9px]" : ""} rounded-[10px] border border-border-alpha-15 bg-bg-secondary/70 p-[11px]`}><div className="flex items-center gap-[9px]"><LuMusic2 size={19} className="text-accent" /><div className="min-w-0"><p className="m-0 truncate font-semibold">{snapshot.title}</p><p className="m-0 text-[11px] text-text-tertiary">{snapshot.tracks.length} Tracks</p></div></div>{!mine && <button type="button" disabled={busy} onClick={() => void importPlaylist(message)} className="mt-[10px] flex items-center gap-[6px] rounded-[8px] bg-accent px-[10px] py-[6px] text-[11px] font-semibold text-white hover:opacity-90"><LuDownload size={14} />{c.import}</button>}</div>}<time className="mt-[6px] block text-right text-[10px] text-text-tertiary">{new Date(message.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</time></div></div>; })}
                <div ref={endRef} />
              </div>
              {sharePlaylistId && <div className="flex items-center gap-[9px] border-t border-border-alpha-15 bg-accent/10 px-[16px] py-[10px] text-[12px]"><LuMusic2 size={17} className="text-accent" /><span className="min-w-0 flex-1 truncate">{c.share}: {shareTitle || "…"}</span><button type="button" title={c.remove} onClick={() => setParams({}, { replace: true })}><LuX size={15} /></button></div>}
              <form onSubmit={(event) => void send(event)} className="flex items-center gap-[9px] border-t border-border-alpha-15 p-[13px]"><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} placeholder={c.message} aria-label={c.message} className="min-w-0 flex-1 rounded-[10px] border border-border-alpha-15 bg-bg-primary px-[13px] py-[10px] text-[13px] text-text-primary outline-none focus:border-accent" /><button type="submit" disabled={busy || (!draft.trim() && !sharePlaylistId)} title={c.send} className="flex h-[37px] w-[37px] shrink-0 items-center justify-center rounded-[10px] bg-accent text-white hover:opacity-90 disabled:opacity-40"><LuSend size={17} /></button></form>
            </> : <div className="flex flex-1 flex-col items-center justify-center gap-[12px] px-[20px] text-center text-text-tertiary"><LuUsers size={40} className="opacity-40" /><p className="m-0 text-[14px]">{sharePlaylistId ? c.shareHint : c.select}</p></div>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Avatar({ profile }: { profile?: SocialProfile }) {
  return <span aria-hidden="true" className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-accent/20 text-[11px] font-bold text-accent">{initials(profile)}</span>;
}

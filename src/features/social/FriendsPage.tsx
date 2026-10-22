import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LuArrowLeft, LuCheck, LuDownload, LuMusic2, LuPaperclip, LuSearch, LuSend, LuUserPlus, LuUsers, LuX } from "react-icons/lu";
import { api } from "@/shared/api";
import { getSupabaseClient } from "@/shared/supabase/client";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useToast } from "@/shared/ui";
import { useTranslation } from "@/languages";
import { parseSharedPlaylist, socialClient, type Friendship, type SocialMessage, type SocialProfile } from "./socialClient";
import ListeningPanel from "./ListeningPanel";
import { privateMusic } from "@/features/uploads/privateMusic";
import { getFriendVisibility, listFriendActivity, setFriendVisibility, type FriendActivity } from "@/features/cloud/friendActivity";
import { CollaborativePanel } from "@/features/cloud/CollaborativePanel";
import "./SocialLayout.css";

const copy = {
  de: {
    title: "Freunde", subtitle: "Musik zusammen entdecken", search: "Nutzername suchen", noFriends: "Noch keine Freunde. Suche nach einem Nutzernamen und sende eine Anfrage.",
    requests: "Anfragen", friends: "Freunde", add: "Anfrage senden", pending: "Anfrage gesendet", accept: "Annehmen", decline: "Ablehnen", remove: "Entfernen", you: "Du", sent: "Warte auf Antwort", chatEmpty: "Schreib deinem Freund eine Nachricht oder teile eine Playlist.",
    select: "Wähle einen Freund zum Schreiben", message: "Nachricht schreiben …", send: "Senden", share: "Playlist teilen", shareHint: "Wähle einen Freund und sende die Playlist als Kopie.", import: "In meine Bibliothek importieren", imported: "Playlist importiert", messageSent: "Gesendet", searchEmpty: "Keine Nutzer gefunden", setupMissing: "Die Freunde-Tabellen fehlen in Supabase. Führe die Wavo-SQL-Migration im SQL Editor aus.", unknownError: "Ein unbekannter Fehler ist aufgetreten.",
  },
  en: {
    title: "Friends", subtitle: "Discover music together", search: "Search username", noFriends: "No friends yet. Search for a username and send a request.",
    requests: "Requests", friends: "Friends", add: "Send request", pending: "Request sent", accept: "Accept", decline: "Decline", remove: "Remove", you: "You", sent: "Waiting for reply", chatEmpty: "Write a message or share a playlist with your friend.",
    select: "Choose a friend to chat", message: "Write a message …", send: "Send", share: "Share playlist", shareHint: "Choose a friend and send a copy of the playlist.", import: "Import to my library", imported: "Playlist imported", messageSent: "Sent", searchEmpty: "No users found", setupMissing: "The friends tables are missing in Supabase. Run the Wavo SQL migration in the SQL Editor.", unknownError: "An unknown error occurred.",
  },
};

function initials(profile?: SocialProfile): string {
  return (profile?.display_name || profile?.username || "?").slice(0, 2).toUpperCase();
}

function errorText(error: unknown, setupMissing: string, unknownError: string): string {
  if (error && typeof error === "object") {
    const issue = error as { code?: unknown; message?: unknown };
    if (issue.code === "PGRST205") return setupMissing;
    if (typeof issue.message === "string" && issue.message.trim()) return issue.message;
  }
  if (typeof error === "string" && error.trim()) return error;
  return unknownError;
}

export default function FriendsPage() {
  const { locale } = useTranslation();
  const c = locale === "de" ? copy.de : copy.en;
  const me = useAuthStore((state) => state.user?.id);
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const sharePlaylistId = params.get("sharePlaylist");
  const shareCollectionType = params.get("shareCollection") === "album" ? "album" : params.get("shareCollection") === "playlist" ? "playlist" : null;
  const shareCollectionId = params.get("shareId");
  const shareReleaseId = params.get("shareRelease");
  const hasShare = Boolean(sharePlaylistId || shareReleaseId || (shareCollectionType && shareCollectionId));
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SocialProfile[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Record<string, SocialProfile>>({});
  const [activities, setActivities] = useState<Record<string, FriendActivity>>({});
  const [shareActivity, setShareActivity] = useState(false);
  useEffect(() => { if (me) setShareActivity(getFriendVisibility(me) === "friends"); }, [me]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareTitle, setShareTitle] = useState("");
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [attachmentSearch, setAttachmentSearch] = useState("");
  const [ownPlaylists, setOwnPlaylists] = useState<{ id: string; title: string }[]>([]);
  const [ownReleases, setOwnReleases] = useState<{ id: string; title: string }[]>([]);
  const [catalogCollections, setCatalogCollections] = useState<{ id: string; title: string; type: "album" | "playlist" }[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);

  const loadFriends = useCallback(async () => {
    try {
      const rows = await socialClient.listFriendships();
      const ids = [...new Set(rows.map((row) => row.requester_id === me ? row.addressee_id : row.requester_id))];
      const people = await socialClient.profiles(ids);
      const activityRows = await listFriendActivity(ids).catch(() => []);
      setFriendships(rows);
      setProfiles(Object.fromEntries(people.map((person) => [person.user_id, person])));
      setActivities(Object.fromEntries(activityRows.map((activity) => [activity.user_id, activity])));
      setError("");
    } catch (cause) {
      setError(errorText(cause, c.setupMissing, c.unknownError));
    } finally {
      setLoading(false);
    }
  }, [me, c.setupMissing, c.unknownError]);

  useEffect(() => {
    if (!me) return;
    void loadFriends();
    const timer = window.setInterval(() => void loadFriends(), 15000);
    const supabase = getSupabaseClient();
    const channel = supabase.channel(`wavo-friends-${me}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wavo_friendships" }, () => void loadFriends())
      .on("postgres_changes", { event: "*", schema: "public", table: "wavo_friend_activity" }, () => void loadFriends())
      .subscribe();
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [me, loadFriends]);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    let alive = true;
    const timer = window.setTimeout(() => {
      void socialClient.searchProfiles(search).then((items) => { if (alive) setResults(items); }).catch((cause) => { if (alive) setError(errorText(cause, c.setupMissing, c.unknownError)); });
    }, 250);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [search, c.setupMissing, c.unknownError]);

  const loadMessages = useCallback(async (friendId: string) => {
    try { setMessages(await socialClient.messages(friendId)); setError(""); }
    catch (cause) { setError(errorText(cause, c.setupMissing, c.unknownError)); }
  }, [c.setupMissing, c.unknownError]);

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

  useEffect(() => {
    const list = messagesRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, selectedId]);

  useEffect(() => {
    if (!hasShare) { setShareTitle(""); return; }
    let alive = true;
    const request = shareReleaseId ? privateMusic.release(shareReleaseId).then(({ release }) => release.title)
      : sharePlaylistId ? api.getUserPlaylist(sharePlaylistId).then(({ playlist }) => playlist.title)
      : shareCollectionType === "album" ? api.getAlbum(shareCollectionId!).then((album) => album.title)
      : api.getPlaylist(shareCollectionId!).then((playlist) => playlist.title);
    void request.then((title) => { if (alive) setShareTitle(title); }).catch((cause) => { if (alive) setError(errorText(cause, c.setupMissing, c.unknownError)); });
    return () => { alive = false; };
  }, [sharePlaylistId, shareReleaseId, shareCollectionType, shareCollectionId, hasShare, c.setupMissing, c.unknownError]);

  useEffect(() => {
    if (!attachmentOpen) return;
    let active = true;
    void api.listPlaylists().then(({ items }) => {
      if (active) setOwnPlaylists(items.map((item) => ({ id: item.id, title: item.title })));
    }).catch((cause) => { if (active) setError(errorText(cause, c.setupMissing, c.unknownError)); });
    void privateMusic.releases().then((rows) => {
      if (active) setOwnReleases(rows.filter((item) => item.owner_id === me).map((item) => ({ id: item.id, title: item.title })));
    }).catch(() => { if (active) setOwnReleases([]); });
    return () => { active = false; };
  }, [attachmentOpen, me, c.setupMissing, c.unknownError]);

  useEffect(() => {
    if (!attachmentOpen || attachmentSearch.trim().length < 2) { setCatalogCollections([]); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      void Promise.all([api.search(attachmentSearch.trim(), "album"), api.search(attachmentSearch.trim(), "playlist")])
        .then(([albums, playlists]) => {
          if (active) setCatalogCollections([...albums.items, ...playlists.items]
            .filter((item): item is Extract<typeof item, { type: "album" | "playlist" }> => item.type === "album" || item.type === "playlist")
            .slice(0, 12).map((item) => ({ id: item.id, title: item.title, type: item.type })));
        }).catch((cause) => { if (active) setError(errorText(cause, c.setupMissing, c.unknownError)); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [attachmentOpen, attachmentSearch, c.setupMissing, c.unknownError]);

  const accepted = useMemo(() => friendships.filter((row) => row.status === "accepted"), [friendships]);
  const incoming = useMemo(() => friendships.filter((row) => row.status === "pending" && row.addressee_id === me), [friendships, me]);
  const outgoing = useMemo(() => friendships.filter((row) => row.status === "pending" && row.requester_id === me), [friendships, me]);
  const selectedProfile = selectedId ? profiles[selectedId] : undefined;

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); await loadFriends(); setError(""); }
    catch (cause) { setError(errorText(cause, c.setupMissing, c.unknownError)); }
    finally { setBusy(false); }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || (!draft.trim() && !hasShare) || busy) return;
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
      } else if (shareCollectionType && shareCollectionId) {
        const collection = shareCollectionType === "album" ? await api.getAlbum(shareCollectionId) : await api.getPlaylist(shareCollectionId);
        playlist = parseSharedPlaylist({ title: collection.title, tracks: collection.tracks,
          source: { type: shareCollectionType, id: shareCollectionId } });
        if (!playlist) throw new Error("Diese Sammlung kann nicht geteilt werden.");
      }
      if (shareReleaseId) await privateMusic.shareWithFriend(shareReleaseId, selectedId, draft);
      else await socialClient.sendMessage(selectedId, draft, playlist ?? undefined);
      setDraft("");
      if (hasShare) setParams({}, { replace: true });
      await loadMessages(selectedId);
      toast(c.messageSent, "checkmark");
    } catch (cause) { setError(errorText(cause, c.setupMissing, c.unknownError)); }
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

  const chooseAttachment = (kind: "mine" | "album" | "playlist" | "release", id: string) => {
    setParams(kind === "mine" ? { sharePlaylist: id } : kind === "release" ? { shareRelease: id } : { shareCollection: kind, shareId: id });
    setAttachmentOpen(false);
    setAttachmentSearch("");
  };

  const personId = (row: Friendship) => row.requester_id === me ? row.addressee_id : row.requester_id;
  const existingIds = new Set(friendships.flatMap((row) => [row.requester_id, row.addressee_id]));
  const chatIsOpen = Boolean(selectedId && accepted.some((row) => personId(row) === selectedId));

  return (
    <div className="wavo-friends-page min-h-full text-text-primary" data-no-window-drag>
      <div className="mx-auto max-w-[1250px]">
        <div className="mb-[24px] flex items-center gap-[14px]">
          <div className="flex h-[44px] w-[44px] items-center justify-center rounded-[14px] bg-accent/20 text-accent"><LuUsers size={23} /></div>
          <div><h1 className="m-0 text-[27px] font-bold">{c.title}</h1><p className="m-0 text-[13px] text-text-tertiary">{c.subtitle}</p></div>
          <label className="ml-auto flex items-center gap-[7px] text-[11px] text-text-secondary"><input type="checkbox" className="accent-accent" checked={shareActivity} onChange={(event) => {
            if (!me) return;
            const visible = event.target.checked;
            setShareActivity(visible);
            setFriendVisibility(me, visible ? "friends" : "nobody");
          }} />{locale === "de" ? "Aktuellen Song Freunden zeigen" : "Show current song to friends"}</label>
        </div>
        {error && <div role="alert" className="mb-[16px] rounded-[12px] border border-red-400/30 bg-red-500/10 px-[14px] py-[10px] text-[13px] text-red-300">{error}</div>}
        <ListeningPanel friends={accepted.map((row) => { const id = personId(row); return { id, profile: profiles[id] }; })} />
        <CollaborativePanel friends={accepted.map((row) => { const id = personId(row); return { id, name: profiles[id]?.display_name ?? "Wavo" }; })} />
        <div className="wavo-social-layout" data-chat-open={chatIsOpen}>
          <aside className="wavo-social-people rounded-[16px] border border-border-alpha-15 bg-bg-secondary/70 p-[14px]">
            <h2 className="mb-[12px] mt-[2px] text-[14px] font-semibold">{locale === "de" ? "Unterhaltungen" : "Conversations"}</h2>
            <label className="flex items-center gap-[8px] rounded-[10px] border border-border-alpha-15 bg-bg-primary px-[12px] py-[9px] text-text-tertiary">
              <LuSearch size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={c.search} aria-label={c.search} className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-text-primary outline-none" />
            </label>
            {search.trim() && <div className="mt-[14px]"><p className="mb-[7px] text-[11px] font-semibold uppercase tracking-[.12em] text-text-tertiary">{c.search}</p>{results.length ? results.map((person) => <div key={person.user_id} className="flex items-center gap-[9px] rounded-[9px] px-[5px] py-[8px]"><Avatar profile={person} /><div className="min-w-0 flex-1"><p className="m-0 truncate text-[13px] font-semibold">{person.display_name}</p><p className="m-0 truncate text-[11px] text-text-tertiary">@{person.username}</p></div><button type="button" disabled={busy || existingIds.has(person.user_id)} onClick={() => void act(() => socialClient.requestFriend(person.user_id))} aria-label={`${c.add}: ${person.username}`} title={existingIds.has(person.user_id) ? c.pending : c.add} className="rounded-[8px] p-[7px] text-text-secondary hover:bg-white/10 disabled:opacity-35"><LuUserPlus size={17} /></button></div>) : <p className="text-[12px] text-text-tertiary">{c.searchEmpty}</p>}</div>}
            {incoming.length > 0 && <section className="mt-[22px]"><h2 className="mb-[8px] text-[12px] font-semibold uppercase tracking-[.12em] text-text-tertiary">{c.requests} · {incoming.length}</h2>{incoming.map((row) => <div key={row.id} className="flex items-center gap-[9px] py-[7px]"><Avatar profile={profiles[row.requester_id]} /><span className="min-w-0 flex-1 truncate text-[13px]">{profiles[row.requester_id]?.display_name ?? "Wavo"}</span><button type="button" title={c.accept} disabled={busy} onClick={() => void act(() => socialClient.acceptFriend(row.id))} className="rounded-[7px] p-[6px] text-green-400 hover:bg-white/10"><LuCheck size={17} /></button><button type="button" title={c.decline} disabled={busy} onClick={() => void act(() => socialClient.removeFriend(row.id))} className="rounded-[7px] p-[6px] text-text-tertiary hover:bg-white/10"><LuX size={17} /></button></div>)}</section>}
            <section className="mt-[22px]"><h2 className="mb-[8px] text-[12px] font-semibold uppercase tracking-[.12em] text-text-tertiary">{c.friends} · {accepted.length}</h2>{loading ? <p className="text-[12px] text-text-tertiary">…</p> : accepted.length ? accepted.map((row) => { const id = personId(row); const profile = profiles[id]; return <button key={row.id} type="button" aria-pressed={selectedId === id} onClick={() => setSelectedId(id)} className={`flex w-full items-center gap-[10px] rounded-[10px] border px-[8px] py-[9px] text-left transition-colors hover:bg-white/8 ${selectedId === id ? "border-accent/40 bg-accent/15" : "border-transparent"}`}><Avatar profile={profile} /><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{profile?.display_name ?? "Wavo"}</span><span className="block truncate text-[11px] text-text-tertiary">@{profile?.username ?? "…"}</span></span></button>; }) : <p className="text-[12px] leading-[1.5] text-text-tertiary">{c.noFriends}</p>}</section>
            {accepted.some((row) => activities[personId(row)]?.track_title) && <section className="mt-[12px] rounded-[9px] border border-border-alpha-15 px-[9px] py-[8px]">
              <p className="m-0 text-[10px] font-semibold uppercase text-text-tertiary">{locale === "de" ? "Hören gerade" : "Listening now"}</p>
              {accepted.map((row) => { const id = personId(row); const activity = activities[id];
                return activity?.track_title ? <p key={id} className="mb-0 mt-[5px] truncate text-[11px] text-text-secondary">{profiles[id]?.display_name ?? "Wavo"}: {activity.track_title} · {activity.artist_name}</p> : null;
              })}
            </section>}
            {selectedId && accepted.some((row) => personId(row) === selectedId) && <button type="button" disabled={busy} onClick={() => { if (window.confirm(locale === "de" ? "Freund entfernen und Chat schließen?" : "Remove friend and close chat?")) void act(async () => { const row = accepted.find((item) => personId(item) === selectedId); if (row) await socialClient.removeFriend(row.id); setSelectedId(null); }); }} className="mt-[12px] text-[11px] text-text-tertiary hover:text-red-300 disabled:opacity-40">{c.remove}: {profiles[selectedId]?.display_name ?? "Wavo"}</button>}
            {outgoing.length > 0 && <section className="mt-[22px]"><h2 className="mb-[8px] text-[12px] font-semibold uppercase tracking-[.12em] text-text-tertiary">{c.sent}</h2>{outgoing.map((row) => <div key={row.id} className="flex items-center gap-[9px] py-[7px]"><Avatar profile={profiles[row.addressee_id]} /><span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary">{profiles[row.addressee_id]?.display_name ?? "Wavo"}</span><button type="button" title={c.remove} disabled={busy} onClick={() => void act(() => socialClient.removeFriend(row.id))} className="p-[5px] text-text-tertiary hover:text-text-primary"><LuX size={15} /></button></div>)}</section>}
          </aside>
          <section className="wavo-social-chat flex flex-col overflow-hidden rounded-[16px] border border-border-alpha-15 bg-bg-secondary/70">
            {chatIsOpen ? <>
              <header className="flex shrink-0 items-center gap-[11px] border-b border-border-alpha-15 px-[18px] py-[13px]"><button type="button" title={locale === "de" ? "Zurück zu Freunden" : "Back to friends"} aria-label={locale === "de" ? "Zurück zu Freunden" : "Back to friends"} onClick={() => setSelectedId(null)} className="wavo-social-back rounded-[7px] p-[6px] text-text-tertiary hover:bg-white/10 hover:text-text-primary"><LuArrowLeft size={18} /></button><Avatar profile={selectedProfile} /><div className="min-w-0 flex-1"><h2 className="m-0 truncate text-[15px] font-semibold">{selectedProfile?.display_name ?? "Wavo"}</h2><p className="m-0 truncate text-[11px] text-text-tertiary">@{selectedProfile?.username ?? "…"}</p></div><button type="button" title={locale === "de" ? "Chat schließen" : "Close chat"} onClick={() => setSelectedId(null)} className="wavo-social-close rounded-[7px] p-[6px] text-text-tertiary hover:bg-white/10 hover:text-text-primary"><LuX size={17} /></button></header>
              <div ref={messagesRef} className="wavo-social-messages flex-1 space-y-[12px] overflow-y-auto px-[18px] py-[20px]">
                {!messages.length && <div className="flex h-full min-h-[260px] items-center justify-center text-center text-[13px] text-text-tertiary">{c.chatEmpty}</div>}
                {messages.map((message) => { const mine = message.sender_id === me; const snapshot = parseSharedPlaylist(message.playlist_snapshot); return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[min(80%,420px)] rounded-[14px] px-[13px] py-[10px] text-[13px] leading-[1.5] ${mine ? "bg-accent/25" : "bg-bg-primary"}`}>{message.body && <p className="m-0 whitespace-pre-wrap break-words">{message.body}</p>}{snapshot && <div className={`${message.body ? "mt-[9px]" : ""} rounded-[10px] border border-border-alpha-15 bg-bg-secondary/70 p-[11px]`}><div className="flex items-center gap-[9px]"><LuMusic2 size={19} className="text-accent" /><div className="min-w-0"><p className="m-0 truncate font-semibold">{snapshot.title}</p><p className="m-0 text-[11px] text-text-tertiary">{snapshot.source?.type === "album" ? (locale === "de" ? "Album / EP" : "Album / EP") : c.share} · {snapshot.tracks.length} Tracks</p></div></div><div className="mt-[10px] flex flex-wrap gap-[7px]">{snapshot.source && <button type="button" onClick={() => navigate(`/collection?type=${snapshot.source!.type}&id=${encodeURIComponent(snapshot.source!.id)}`)} className="rounded-[8px] border border-border-alpha-15 px-[10px] py-[6px] text-[11px] font-semibold hover:bg-white/10">{locale === "de" ? "Öffnen" : "Open"}</button>}{!mine && <button type="button" disabled={busy} onClick={() => void importPlaylist(message)} className="flex items-center gap-[6px] rounded-[8px] bg-accent px-[10px] py-[6px] text-[11px] font-semibold text-white hover:opacity-90"><LuDownload size={14} />{c.import}</button>}</div></div>}{message.release_id && <button type="button" onClick={() => navigate(`/uploads?release=${encodeURIComponent(message.release_id!)}`)} className="mt-[9px] flex w-full items-center gap-[9px] rounded-[10px] border border-border-alpha-15 bg-bg-secondary/70 p-[11px] text-left hover:bg-white/10"><LuMusic2 size={19} className="text-accent" /><span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold">{locale === "de" ? "Private Musik" : "Private music"}</span><span className="block text-[11px] text-text-tertiary">{locale === "de" ? "Song oder EP öffnen" : "Open song or EP"}</span></span></button>}<time className="mt-[6px] block text-right text-[10px] text-text-tertiary">{new Date(message.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</time></div></div>; })}
              </div>
              {attachmentOpen && <div className="wavo-social-attachment shrink-0 border-t border-border-alpha-15 bg-bg-primary/80 p-[12px]"><div className="flex items-center gap-[9px]"><h3 className="m-0 flex-1 text-[12px] font-semibold">{locale === "de" ? "Playlist oder EP anhängen" : "Attach playlist or EP"}</h3><button type="button" onClick={() => setAttachmentOpen(false)} aria-label={locale === "de" ? "Schließen" : "Close"} className="rounded p-[4px] hover:bg-white/10"><LuX size={14} /></button></div><label className="mt-[9px] flex items-center gap-[7px] rounded-[8px] border border-border-alpha-15 bg-bg-secondary px-[9px] py-[7px]"><LuSearch size={14} className="text-text-tertiary" /><input value={attachmentSearch} onChange={(event) => setAttachmentSearch(event.target.value)} placeholder={locale === "de" ? "Album, EP oder Playlist suchen …" : "Search albums, EPs or playlists …"} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" /></label><div className="mt-[8px] max-h-[190px] overflow-y-auto"><p className="my-[6px] text-[10px] font-bold uppercase tracking-[.12em] text-text-tertiary">{locale === "de" ? "Deine Playlists" : "Your playlists"}</p>{ownPlaylists.filter((item) => item.title.toLowerCase().includes(attachmentSearch.toLowerCase())).slice(0, 8).map((item) => <button key={`mine-${item.id}`} type="button" onClick={() => chooseAttachment("mine", item.id)} className="block w-full truncate rounded-[7px] px-[8px] py-[6px] text-left text-[12px] hover:bg-white/10">{item.title}</button>)}{ownReleases.length > 0 && <p className="my-[6px] text-[10px] font-bold uppercase tracking-[.12em] text-text-tertiary">{locale === "de" ? "Deine private Musik" : "Your private music"}</p>}{ownReleases.filter((item) => item.title.toLowerCase().includes(attachmentSearch.toLowerCase())).slice(0, 8).map((item) => <button key={`release-${item.id}`} type="button" onClick={() => chooseAttachment("release", item.id)} className="block w-full truncate rounded-[7px] px-[8px] py-[6px] text-left text-[12px] hover:bg-white/10">{item.title}</button>)}{catalogCollections.length > 0 && <p className="my-[6px] text-[10px] font-bold uppercase tracking-[.12em] text-text-tertiary">{locale === "de" ? "Katalog" : "Catalog"}</p>}{catalogCollections.map((item) => <button key={`${item.type}-${item.id}`} type="button" onClick={() => chooseAttachment(item.type, item.id)} className="flex w-full items-center gap-[8px] rounded-[7px] px-[8px] py-[6px] text-left text-[12px] hover:bg-white/10"><span className="min-w-0 flex-1 truncate">{item.title}</span><span className="text-[10px] text-text-tertiary">{item.type === "album" ? "Album / EP" : "Playlist"}</span></button>)}</div></div>}
              {hasShare && <div className="flex shrink-0 items-center gap-[9px] border-t border-border-alpha-15 bg-accent/10 px-[16px] py-[10px] text-[12px]"><LuMusic2 size={17} className="text-accent" /><span className="min-w-0 flex-1 truncate">{c.share}: {shareTitle || "…"}</span><button type="button" title={c.remove} onClick={() => setParams({}, { replace: true })}><LuX size={15} /></button></div>}
              <form onSubmit={(event) => void send(event)} className="flex shrink-0 items-center gap-[9px] border-t border-border-alpha-15 p-[13px]"><button type="button" title={locale === "de" ? "Playlist oder EP anhängen" : "Attach playlist or EP"} aria-label={locale === "de" ? "Playlist oder EP anhängen" : "Attach playlist or EP"} onClick={() => setAttachmentOpen((value) => !value)} className={`flex h-[37px] w-[37px] shrink-0 items-center justify-center rounded-[9px] border border-border-alpha-15 hover:bg-white/10 ${attachmentOpen ? "text-accent" : "text-text-secondary"}`}><LuPaperclip size={16} /></button><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} placeholder={c.message} aria-label={c.message} className="min-w-0 flex-1 rounded-[10px] border border-border-alpha-15 bg-bg-primary px-[13px] py-[10px] text-[13px] text-text-primary outline-none focus:border-accent" /><button type="submit" disabled={busy || (!draft.trim() && !hasShare)} title={c.send} className="flex h-[37px] w-[37px] shrink-0 items-center justify-center rounded-[10px] bg-accent text-white hover:opacity-90 disabled:opacity-40"><LuSend size={17} /></button></form>
            </> : <div className="flex flex-1 flex-col items-center justify-center gap-[12px] px-[20px] text-center text-text-tertiary"><LuUsers size={40} className="opacity-40" /><p className="m-0 text-[14px]">{hasShare ? c.shareHint : c.select}</p></div>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Avatar({ profile }: { profile?: SocialProfile }) {
  return <span aria-hidden="true" className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-accent/20 text-[11px] font-bold text-accent">{initials(profile)}</span>;
}

import { useEffect, useState } from "react";
import { LuListMusic, LuPlus } from "react-icons/lu";
import { useTranslation } from "@/languages";
import { Select } from "@/shared/ui/Select";
import { useAuthStore } from "@/features/auth/store/authStore";
import { getSupabaseClient } from "@/shared/supabase/client";
import { useSearchTracks } from "@/features/search/hooks/useSearchTracks";
import { wavoDb } from "@/shared/storage/wavoDb";
import { toClientTrack } from "@/shared/api";
import { playerEngine } from "@/features/player";
import type { Track as ApiTrack } from "@/shared/contracts";
import { collaborativePlaylists, type Collaborator, type SharedPlaylistRow, type SharedTrack } from "./collaborativePlaylists";

interface Props { friends: { id: string; name: string }[] }

export function CollaborativePanel({ friends }: Props) {
  const { locale } = useTranslation();
  const de = locale === "de";
  const me = useAuthStore((state) => state.user?.id);
  const [playlists, setPlaylists] = useState<SharedPlaylistRow[]>([]);
  const [members, setMembers] = useState<Collaborator[]>([]);
  const [local, setLocal] = useState<{ id: string; title: string }[]>([]);
  const [localId, setLocalId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<SharedTrack[]>([]);
  const [search, setSearch] = useState("");
  const [friendId, setFriendId] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = playlists.find((item) => item.id === selectedId);
  const ownRole = members.find((item) => item.playlist_id === selectedId && item.user_id === me);
  const canEdit = selected?.owner_id === me || ownRole?.status === "active" && ownRole.role === "editor";
  const { tracks } = useSearchTracks(search, { enabled: Boolean(canEdit), limit: 8 });

  const refresh = async () => {
    if (!me) return;
    const result = await collaborativePlaylists.list();
    setPlaylists(result.playlists);
    setMembers(result.members);
    setLocal((await wavoDb.listUserPlaylistRecords(me)).map((record) => ({ id: record.playlist.id, title: record.playlist.title })));
  };
  const refreshItems = async (id: string) => setItems(await collaborativePlaylists.items(id));
  useEffect(() => {
    if (!me) return;
    void refresh().catch(() => {});
    const client = getSupabaseClient();
    const channel = client.channel(`wavo-collab-${me}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wavo_shared_playlists" }, () => { void refresh().catch(() => {}); })
      .on("postgres_changes", { event: "*", schema: "public", table: "wavo_playlist_collaborators" }, () => { void refresh().catch(() => {}); })
      .on("postgres_changes", { event: "*", schema: "public", table: "wavo_shared_playlist_items" }, (event) => {
        const id = (event.new as { playlist_id?: string }).playlist_id ?? (event.old as { playlist_id?: string }).playlist_id;
        if (id === selectedId) void refreshItems(id).catch(() => {});
      }).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [me, selectedId]);
  useEffect(() => { if (selectedId) void refreshItems(selectedId).catch(() => {}); else setItems([]); }, [selectedId]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); await refresh(); if (selectedId) await refreshItems(selectedId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const add = (track: (typeof tracks)[number]) => {
    if (!selectedId) return;
    const artists = track.artistList?.map((artist) => ({ id: artist.id ?? artist.name, name: artist.name }))
      ?? track.artists.split(",").map((name) => ({ id: name.trim(), name: name.trim() }));
    const value: ApiTrack = { id: track.id, title: track.title, artists, durationMs: track.durationMs,
      ...(track.album ? { album: track.album } : {}),
      ...(track.coverUrl ? { cover: { url: track.coverUrl, width: 512, height: 512 } } : {}) };
    void run(async () => { await collaborativePlaylists.addTrack(selectedId, value); setSearch(""); });
  };

  return <section className="wavo-collaborative-panel wavo-social-feature">
    <div className="wavo-feature-header"><span className="wavo-feature-icon"><LuListMusic size={22} /></span><span className="wavo-feature-kicker">{de ? "EUER GESCHMACK. EINE PLAYLIST." : "YOUR TASTE. ONE PLAYLIST."}</span><span className="wavo-playlist-art" aria-hidden="true"><i /><i /><i /></span></div>
    <h2 className="m-0 text-[15px] font-semibold">{de ? "Gemeinsame Playlists" : "Collaborative playlists"}</h2>
    <p className="mb-[12px] mt-[3px] text-[12px] text-text-secondary">{de ? "Erstellt aus deiner Playlist eine Kopie und macht sie gemeinsam zu eurer." : "Turn a copy of your playlist into something you make together."}</p>
    <div className="wavo-collaborative-create">
      <Select value={localId} onChange={setLocalId} aria-label={de ? "Eigene Playlist" : "Own playlist"}
        placeholder={de ? "Eigene Playlist wählen" : "Choose your playlist"}
        className="wavo-playlist-select" menuClassName="wavo-playlist-select-menu"
        options={local.map((playlist) => ({ value: playlist.id, label: playlist.title, icon: <LuListMusic size={17} /> }))}
        emptyState={<div className="wavo-playlist-select-empty"><span><LuListMusic size={23} /></span><strong>{de ? "Noch keine Playlists" : "No playlists yet"}</strong><p>{de ? "Erstelle zuerst eine eigene Playlist in deiner Bibliothek. Danach kannst du sie hier mit Freunden teilen." : "Create a playlist in your library first. Then come back to share a copy with friends."}</p></div>}
      />
      <button type="button" disabled={busy || !localId} onClick={() => void run(async () => {
        const created = await collaborativePlaylists.createFromLocal(localId);
        setSelectedId(created.id);
      })} className="wavo-feature-action"><LuPlus size={15} />{de ? "Kopie teilen" : "Share a copy"}</button>
    </div>
    {playlists.length > 0 && <div className="mt-[11px] flex flex-wrap gap-[6px]">{playlists.map((playlist) => {
      const membership = members.find((member) => member.playlist_id === playlist.id && member.user_id === me);
      return <div key={playlist.id} className="flex items-center gap-[5px]">
        <button type="button" onClick={() => setSelectedId(playlist.id)} className={`rounded-[7px] border px-[9px] py-[5px] text-[11px] ${selectedId === playlist.id ? "border-accent-primary text-accent-primary" : "border-border-alpha-14 text-text-secondary"}`}>{playlist.title}</button>
        {membership?.status === "invited" && <button type="button" disabled={busy} onClick={() => void run(() => collaborativePlaylists.accept(playlist.id))}
          className="rounded-[7px] bg-accent-primary px-[7px] py-[5px] text-[10px] text-white disabled:opacity-40">{de ? "Annehmen" : "Accept"}</button>}
      </div>;
    })}</div>}
    {selected && <div className="mt-[11px] grid gap-[11px] border-t border-border-alpha-14 pt-[11px] md:grid-cols-2">
      <div>
        <div className="flex items-center gap-[8px]">
          <p className="m-0 min-w-0 flex-1 truncate text-[12px] font-semibold">{selected.title} · {items.length} {de ? "Songs" : "tracks"}</p>
          <button type="button" disabled={!items.length} onClick={() => {
            const queue = items.map((item) => toClientTrack(item.track_snapshot));
            void playerEngine.playTrack(queue[0], queue, `shared:${selected.id}`);
          }} className="rounded-[7px] border border-border-alpha-14 px-[8px] py-[4px] text-[11px] text-accent-primary disabled:opacity-40">
            {de ? "Abspielen" : "Play"}
          </button>
        </div>
        <div className="mt-[6px] max-h-[190px] overflow-y-auto">{items.map((item, i) => {
          const track = toClientTrack(item.track_snapshot);
          return <div key={item.item_id} className="flex items-center gap-[5px] border-b border-border-alpha-14 py-[5px] text-[11px]">
            <span className="min-w-0 flex-1 truncate">{i + 1}. {track.title}</span>
            {canEdit && <><button type="button" disabled={busy || i === 0} title={de ? "Nach oben" : "Move up"} onClick={() => void run(() => collaborativePlaylists.moveTrack(selected.id, item.item_id, items[i - 1].item_id))} className="px-[4px] disabled:opacity-30">↑</button>
              <button type="button" disabled={busy} title={de ? "Entfernen" : "Remove"} onClick={() => void run(() => collaborativePlaylists.removeTrack(selected.id, item.item_id))} className="px-[4px] text-red-300">×</button></>}
          </div>;
        })}</div>
      </div>
      <div className="space-y-[8px]">
        {selected.owner_id === me && <div className="flex flex-wrap gap-[5px]">
          <select value={friendId} onChange={(event) => setFriendId(event.target.value)} className="min-w-[120px] flex-1 rounded-[7px] border border-border-alpha-14 bg-bg-primary px-[7px] py-[5px] text-[11px]">
            <option value="">{de ? "Freund wählen" : "Choose friend"}</option>
            {friends.filter((friend) => !members.some((member) => member.playlist_id === selected.id && member.user_id === friend.id)).map((friend) => <option key={friend.id} value={friend.id}>{friend.name}</option>)}
          </select>
          <select value={role} onChange={(event) => setRole(event.target.value as "editor" | "viewer")} className="rounded-[7px] border border-border-alpha-14 bg-bg-primary px-[6px] py-[5px] text-[11px]"><option value="editor">{de ? "Bearbeiten" : "Edit"}</option><option value="viewer">{de ? "Ansehen" : "View"}</option></select>
          <button type="button" disabled={busy || !friendId} onClick={() => void run(async () => { await collaborativePlaylists.invite(selected.id, friendId, role); setFriendId(""); })}
            className="rounded-[7px] border border-border-alpha-14 px-[8px] py-[5px] text-[11px] disabled:opacity-40">{de ? "Einladen" : "Invite"}</button>
        </div>}
        {canEdit && <><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={de ? "Song hinzufügen …" : "Add song …"}
          className="w-full rounded-[7px] border border-border-alpha-14 bg-bg-primary px-[8px] py-[6px] text-[11px] outline-none" />
          {search.trim().length >= 2 && <div className="max-h-[140px] overflow-y-auto">{tracks.slice(0, 8).map((track) => <button key={track.id} type="button" disabled={busy} onClick={() => add(track)} className="block w-full truncate rounded-[6px] px-[7px] py-[5px] text-left text-[11px] hover:bg-white/10 disabled:opacity-40">+ {track.title} · {track.artists}</button>)}</div>}</>}
        {selected.owner_id !== me && ownRole?.status === "active" && <button type="button" disabled={busy} onClick={() => void run(async () => { await collaborativePlaylists.leave(selected.id); setSelectedId(null); })}
          className="text-[11px] text-text-tertiary hover:text-red-300">{de ? "Playlist verlassen" : "Leave playlist"}</button>}
        {selected.owner_id === me && <button type="button" disabled={busy} onClick={() => void run(async () => {
          await collaborativePlaylists.stopSharing(selected.id); setSelectedId(null);
        })} className="text-[11px] text-text-tertiary hover:text-red-300">
          {de ? "Gemeinsame Freigabe beenden" : "Stop sharing"}
        </button>}
      </div>
    </div>}
    {error && <p role="alert" className="mb-0 mt-[8px] text-[11px] text-red-300">{error}</p>}
  </section>;
}

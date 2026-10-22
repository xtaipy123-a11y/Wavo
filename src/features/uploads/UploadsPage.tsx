import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LuArrowLeft, LuCopy, LuDisc3, LuMusic2, LuPlay, LuPlus, LuSend, LuTrash2, LuUpload, LuX } from "react-icons/lu";
import { playerEngine } from "@/features/player";
import { useAuthStore } from "@/features/auth/store/authStore";
import { socialClient, type SocialProfile } from "@/features/social/socialClient";
import { useTranslation } from "@/languages";
import { useToast } from "@/shared/ui";
import { privateMusic, type PrivateRelease, type PrivateUpload, type ReleaseDetail } from "./privateMusic";
import { takePendingReleaseToken } from "@/app/pendingReleaseLink";

function description(error: unknown, de: boolean): string {
  if (error && typeof error === "object") {
    const issue = error as { code?: unknown; message?: unknown };
    if (issue.code === "PGRST205" || issue.code === "PGRST202")
      return de ? "Die Datenbank für eigene Musik fehlt noch. Die SQL-Migration muss im Supabase-Projekt ausgeführt werden." :
        "Private music is not set up yet. Run the SQL migration in Supabase.";
    if (typeof issue.message === "string") return issue.message;
  }
  return error instanceof Error ? error.message : de ? "Aktion fehlgeschlagen." : "Action failed.";
}

function extractToken(value: string): string | null {
  const trimmed = value.trim();
  if (/^[a-f0-9]{64}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "wavo:" || url.hostname !== "release") return null;
    const token = url.searchParams.get("token");
    return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
  } catch { return null; }
}

export default function UploadsPage() {
  const { locale } = useTranslation();
  const de = locale === "de";
  const me = useAuthStore((state) => state.user?.id);
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const releaseParam = params.get("release");
  const claimParam = params.get("claim");
  const [releases, setReleases] = useState<PrivateRelease[]>([]);
  const [uploads, setUploads] = useState<PrivateUpload[]>([]);
  const [detail, setDetail] = useState<ReleaseDetail | null>(null);
  const [friends, setFriends] = useState<SocialProfile[]>([]);
  const [friendId, setFriendId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [artist, setArtist] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadLabel, setUploadLabel] = useState("");
  const [epTitle, setEpTitle] = useState("");
  const [epArtist, setEpArtist] = useState("");
  const [epDescription, setEpDescription] = useState("");
  const [epKind, setEpKind] = useState<"ep" | "album">("ep");
  const [epTracks, setEpTracks] = useState<string[]>([]);
  const [cover, setCover] = useState<File | null>(null);
  const [linkInput, setLinkInput] = useState("");
  const [newLink, setNewLink] = useState("");

  const refresh = useCallback(async () => {
    if (!me) return;
    try {
      const [releaseRows, uploadRows, friendships] = await Promise.all([
        privateMusic.releases(), privateMusic.myUploads(), socialClient.listFriendships(),
      ]);
      const ids = friendships.filter((item) => item.status === "accepted")
        .map((item) => item.requester_id === me ? item.addressee_id : item.requester_id);
      const people = await socialClient.profiles(ids);
      setReleases(releaseRows);
      setUploads(uploadRows);
      setFriends(people);
      setError("");
    } catch (cause) { setError(description(cause, de)); }
    finally { setLoading(false); }
  }, [me, de]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!releaseParam) { setDetail(null); return; }
    let active = true;
    void privateMusic.release(releaseParam).then((value) => { if (active) { setDetail(value); setError(""); } })
      .catch((cause) => { if (active) setError(description(cause, de)); });
    return () => { active = false; };
  }, [releaseParam, de]);
  useEffect(() => {
    if (!claimParam || !me) return;
    takePendingReleaseToken();
    let active = true;
    void privateMusic.claimShareLink(claimParam).then(async (id) => {
      if (!active) return;
      await refresh();
      setParams({ release: id }, { replace: true });
    }).catch((cause) => { if (active) { setError(description(cause, de)); setParams({}, { replace: true }); } });
    return () => { active = false; };
  }, [claimParam, me, refresh, setParams, de]);

  const owned = useMemo(() => releases.filter((item) => item.owner_id === me), [releases, me]);
  const shared = useMemo(() => releases.filter((item) => item.owner_id !== me), [releases, me]);
  const isOwner = Boolean(detail && detail.release.owner_id === me);

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true); setError("");
    try { await action(); toast(success, "checkmark"); await refresh(); }
    catch (cause) { setError(description(cause, de)); }
    finally { setBusy(false); }
  };

  const upload = (event: FormEvent) => {
    event.preventDefault();
    if (!audioFiles.length || !artist.trim() || busy) return;
    void run(async () => {
      for (const [index, file] of audioFiles.entries()) {
        setUploadLabel(`${index + 1}/${audioFiles.length}: ${file.name}`);
        setProgress(0);
        await privateMusic.upload(file, file.name.replace(/\.[^.]+$/, ""), artist, setProgress);
      }
      setAudioFiles([]);
      setProgress(null);
      setUploadLabel("");
    }, de ? "Musik hochgeladen" : "Music uploaded");
  };

  const createEp = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    void run(async () => {
      const id = await privateMusic.createRelease(epKind, epTitle, epArtist, epTracks, epDescription, cover ?? undefined);
      setEpTitle(""); setEpArtist(""); setEpDescription(""); setEpTracks([]); setCover(null);
      setParams({ release: id });
    }, de ? "Veröffentlichung erstellt" : "Release created");
  };

  const play = (trackIndex = 0) => {
    if (!detail?.tracks.length) return;
    const track = detail.tracks[trackIndex];
    if (track) void playerEngine.playTrack(track, detail.tracks, detail.release.title, detail.coverUrl);
  };

  const toggleTrack = (id: string) => setEpTracks((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const shiftTrack = (index: number, change: number) => setEpTracks((current) => {
    const next = [...current];
    const target = index + change;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  return <div className="mx-auto max-w-[1100px] px-[clamp(16px,4vw,36px)] py-[28px] text-text-primary" data-no-window-drag>
    <Link to="/library" className="mb-[23px] inline-flex items-center gap-[7px] text-[12px] text-text-secondary hover:text-text-primary"><LuArrowLeft size={16} />{de ? "Zur Bibliothek" : "Back to library"}</Link>
    <div className="mb-[22px] flex items-center gap-[14px]"><span className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[14px] bg-accent/20 text-accent"><LuUpload size={25} /></span><div><h1 className="m-0 text-[26px] font-bold">{de ? "Eigene Musik" : "Your music"}</h1><p className="m-0 text-[12px] text-text-secondary">{de ? "Private Songs und EPs – sichtbar nur für dich und Personen, mit denen du sie teilst." : "Private songs and EPs, only visible to you and people you share with."}</p></div></div>
    {error && <div role="alert" className="mb-[16px] rounded-[12px] border border-red-400/30 bg-red-500/10 px-[14px] py-[10px] text-[13px] text-red-300">{error}</div>}
    <div className="grid min-w-0 gap-[16px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-[16px]">
        <section className="rounded-[16px] border border-border-alpha-15 bg-bg-secondary/70 p-[18px]">
          <h2 className="mb-[6px] mt-0 text-[17px] font-semibold">{de ? "Songs hochladen" : "Upload songs"}</h2>
          <p className="mb-[15px] text-[12px] text-text-tertiary">{de ? "MP3, WAV, FLAC, M4A, AAC, OGG oder WebM · maximal 50 MB pro Datei. Jeder Song erscheint zunächst als private Single." : "MP3, WAV, FLAC, M4A, AAC, OGG or WebM · up to 50 MB each. Each song starts as a private single."}</p>
          <form onSubmit={upload} className="space-y-[10px]">
            <input className="w-full rounded-[9px] border border-border-alpha-15 bg-bg-primary px-[12px] py-[9px] text-[13px] outline-none focus:border-accent" value={artist} onChange={(event) => setArtist(event.target.value)} maxLength={200} placeholder={de ? "Künstlername" : "Artist name"} aria-label={de ? "Künstlername" : "Artist name"} required />
            <input type="file" multiple accept=".mp3,.wav,.flac,.m4a,.aac,.ogg,.webm,audio/*" onChange={(event) => setAudioFiles(Array.from(event.target.files ?? []))} className="block w-full text-[12px] text-text-secondary file:mr-[10px] file:rounded-[8px] file:border-0 file:bg-accent/20 file:px-[10px] file:py-[8px] file:text-accent" aria-label={de ? "Musikdateien auswählen" : "Select music files"} />
            {uploadLabel && <p className="m-0 truncate text-[11px] text-text-secondary">{uploadLabel} · {progress ?? 0}%</p>}
            {progress !== null && <progress value={progress} max={100} className="h-[5px] w-full accent-accent" />}
            <button type="submit" disabled={busy || !audioFiles.length || !artist.trim()} className="inline-flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[9px] text-[12px] font-semibold text-white disabled:opacity-40"><LuUpload size={15} />{de ? "Hochladen" : "Upload"}</button>
          </form>
        </section>
        <section className="rounded-[16px] border border-border-alpha-15 bg-bg-secondary/70 p-[18px]">
          <h2 className="mb-[6px] mt-0 text-[17px] font-semibold">{de ? "EP oder Album erstellen" : "Create EP or album"}</h2>
          <p className="mb-[14px] text-[12px] text-text-tertiary">{de ? "Wähle deine Songs in der gewünschten Reihenfolge." : "Choose your songs in the order you want."}</p>
          <form onSubmit={createEp} className="space-y-[10px]">
            <select value={epKind} onChange={(event) => setEpKind(event.target.value as "ep" | "album")} className="w-full rounded-[9px] border border-border-alpha-15 bg-bg-primary px-[12px] py-[9px] text-[13px]"><option value="ep">EP</option><option value="album">Album</option></select>
            <input value={epTitle} onChange={(event) => setEpTitle(event.target.value)} maxLength={200} required placeholder={de ? "Titel der Veröffentlichung" : "Release title"} aria-label={de ? "Titel der Veröffentlichung" : "Release title"} className="w-full rounded-[9px] border border-border-alpha-15 bg-bg-primary px-[12px] py-[9px] text-[13px] outline-none focus:border-accent" />
            <input value={epArtist} onChange={(event) => setEpArtist(event.target.value)} maxLength={200} required placeholder={de ? "Künstlername" : "Artist name"} aria-label={de ? "Künstlername" : "Artist name"} className="w-full rounded-[9px] border border-border-alpha-15 bg-bg-primary px-[12px] py-[9px] text-[13px] outline-none focus:border-accent" />
            <textarea value={epDescription} onChange={(event) => setEpDescription(event.target.value)} maxLength={2000} rows={2} placeholder={de ? "Beschreibung (optional)" : "Description (optional)"} aria-label={de ? "Beschreibung" : "Description"} className="w-full resize-none rounded-[9px] border border-border-alpha-15 bg-bg-primary px-[12px] py-[9px] text-[13px] outline-none focus:border-accent" />
            <label className="block text-[11px] text-text-secondary">{de ? "Cover (optional)" : "Cover (optional)"}<input type="file" accept=".jpg,.jpeg,.png,.webp,image/*" onChange={(event) => setCover(event.target.files?.[0] ?? null)} className="mt-[5px] block w-full text-[12px]" /></label>
            <div className="max-h-[200px] overflow-y-auto rounded-[9px] border border-border-alpha-15 p-[6px]">{uploads.length ? uploads.map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-[8px] rounded-[7px] px-[6px] py-[6px] text-[12px] hover:bg-white/5"><input type="checkbox" checked={epTracks.includes(item.id)} onChange={() => toggleTrack(item.id)} className="accent-accent" /><span className="min-w-0 flex-1 truncate">{item.title} · {item.artist_name}</span></label>) : <p className="m-[8px] text-[12px] text-text-tertiary">{de ? "Lade zuerst Songs hoch." : "Upload songs first."}</p>}</div>
            {epTracks.length > 0 && <div className="space-y-[3px]">{epTracks.map((id, index) => { const item = uploads.find((row) => row.id === id); return <div key={id} className="flex items-center gap-[7px] text-[11px] text-text-secondary"><span className="w-[15px]">{index + 1}.</span><span className="min-w-0 flex-1 truncate">{item?.title}</span><button type="button" disabled={index === 0} onClick={() => shiftTrack(index, -1)} aria-label={de ? "Nach oben" : "Move up"}>↑</button><button type="button" disabled={index === epTracks.length - 1} onClick={() => shiftTrack(index, 1)} aria-label={de ? "Nach unten" : "Move down"}>↓</button></div>; })}</div>}
            <button type="submit" disabled={busy || !epTracks.length || !epTitle.trim() || !epArtist.trim()} className="inline-flex items-center gap-[7px] rounded-[9px] bg-accent px-[14px] py-[9px] text-[12px] font-semibold text-white disabled:opacity-40"><LuPlus size={15} />{de ? "Erstellen" : "Create"}</button>
          </form>
        </section>
        <section className="rounded-[16px] border border-border-alpha-15 bg-bg-secondary/70 p-[18px]">
          <h2 className="mb-[10px] mt-0 text-[17px] font-semibold">{de ? "Freigabelink öffnen" : "Open share link"}</h2>
          <form onSubmit={(event) => { event.preventDefault(); const token = extractToken(linkInput); if (!token) { setError(de ? "Ungültiger Wavo-Link." : "Invalid Wavo link."); return; } setParams({ claim: token }); setLinkInput(""); }} className="flex min-w-0 gap-[8px]"><input value={linkInput} onChange={(event) => setLinkInput(event.target.value)} placeholder="wavo://release?…" aria-label={de ? "Freigabelink" : "Share link"} className="min-w-0 flex-1 rounded-[9px] border border-border-alpha-15 bg-bg-primary px-[10px] py-[9px] text-[12px] outline-none focus:border-accent" /><button type="submit" className="rounded-[9px] bg-accent px-[12px] text-[12px] font-semibold text-white">{de ? "Öffnen" : "Open"}</button></form>
        </section>
      </div>
      <div className="min-w-0 space-y-[16px]">
        <section className="rounded-[16px] border border-border-alpha-15 bg-bg-secondary/70 p-[18px]">
          <h2 className="mb-[11px] mt-0 text-[17px] font-semibold">{de ? "Deine Veröffentlichungen" : "Your releases"} · {owned.length}</h2>
          {loading && <p className="text-[12px] text-text-tertiary">…</p>}
          {!loading && !owned.length && <p className="text-[12px] text-text-tertiary">{de ? "Noch keine Musik hochgeladen." : "No music uploaded yet."}</p>}
          {owned.map((item) => <ReleaseRow key={item.id} release={item} active={releaseParam === item.id} onClick={() => setParams({ release: item.id })} />)}
          <h2 className="mb-[11px] mt-[22px] text-[17px] font-semibold">{de ? "Mit dir geteilt" : "Shared with you"} · {shared.length}</h2>
          {!loading && !shared.length && <p className="text-[12px] text-text-tertiary">{de ? "Hier erscheinen Songs und EPs, die andere mit dir teilen." : "Songs and EPs shared with you appear here."}</p>}
          {shared.map((item) => <ReleaseRow key={item.id} release={item} active={releaseParam === item.id} onClick={() => setParams({ release: item.id })} />)}
        </section>
        {detail && <section className="rounded-[16px] border border-border-alpha-15 bg-bg-secondary/70 p-[18px]">
          <div className="flex items-start gap-[13px]"><div className="flex h-[78px] w-[78px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-bg-primary">{detail.coverUrl ? <img src={detail.coverUrl} alt="" className="h-full w-full object-cover" /> : <LuDisc3 size={30} className="text-accent" />}</div><div className="min-w-0 flex-1"><p className="m-0 text-[10px] font-bold uppercase tracking-[.12em] text-accent">{detail.release.kind}</p><h2 className="my-[3px] truncate text-[18px] font-bold">{detail.release.title}</h2><p className="m-0 truncate text-[12px] text-text-secondary">{detail.release.artist_name} · {detail.tracks.length} {de ? "Songs" : "tracks"}</p></div><button type="button" onClick={() => setParams({})} aria-label={de ? "Schließen" : "Close"} className="rounded-[7px] p-[5px] text-text-tertiary hover:bg-white/10"><LuX size={17} /></button></div>
          {detail.release.description && <p className="mt-[12px] text-[12px] text-text-secondary">{detail.release.description}</p>}
          <button type="button" disabled={!detail.tracks.length} onClick={() => play()} className="mt-[13px] inline-flex items-center gap-[7px] rounded-[9px] bg-accent px-[12px] py-[8px] text-[12px] font-semibold text-white disabled:opacity-40"><LuPlay size={15} />{de ? "Abspielen" : "Play"}</button>
          <div className="mt-[12px] divide-y divide-border-alpha-15">{detail.tracks.map((track, index) => <button key={track.id} type="button" onClick={() => play(index)} className="flex w-full items-center gap-[9px] py-[9px] text-left text-[12px] hover:text-accent"><span className="w-[19px] text-text-tertiary">{index + 1}</span><span className="min-w-0 flex-1 truncate">{track.title}</span><LuPlay size={13} /></button>)}</div>
          {isOwner && <div className="mt-[14px] space-y-[12px] border-t border-border-alpha-15 pt-[14px]">
            <div className="flex min-w-0 gap-[8px]"><select value={friendId} onChange={(event) => setFriendId(event.target.value)} className="min-w-0 flex-1 rounded-[9px] border border-border-alpha-15 bg-bg-primary px-[9px] py-[8px] text-[12px]"><option value="">{de ? "Freund auswählen" : "Choose friend"}</option>{friends.map((friend) => <option key={friend.user_id} value={friend.user_id}>{friend.display_name} (@{friend.username})</option>)}</select><button type="button" disabled={busy || !friendId} onClick={() => void run(async () => { await privateMusic.shareWithFriend(detail.release.id, friendId, `${detail.release.title} · ${detail.release.artist_name}`); setFriendId(""); }, de ? "Im Chat geteilt" : "Shared in chat")} className="inline-flex items-center gap-[6px] rounded-[9px] bg-accent px-[10px] text-[11px] font-semibold text-white disabled:opacity-40"><LuSend size={14} />{de ? "Senden" : "Send"}</button></div>
            <div className="flex flex-wrap gap-[7px]"><button type="button" disabled={busy} onClick={() => void run(async () => { const link = await privateMusic.createShareLink(detail.release.id); setNewLink(link); await navigator.clipboard.writeText(link); }, de ? "Link kopiert" : "Link copied")} className="inline-flex items-center gap-[6px] rounded-[8px] border border-border-alpha-15 px-[10px] py-[7px] text-[11px] hover:bg-white/10 disabled:opacity-40"><LuCopy size={14} />{de ? "Privaten Link kopieren" : "Copy private link"}</button><button type="button" disabled={busy} onClick={() => void run(() => privateMusic.revokeLinks(detail.release.id), de ? "Links widerrufen" : "Links revoked")} className="rounded-[8px] border border-border-alpha-15 px-[10px] py-[7px] text-[11px] text-text-secondary hover:bg-white/10 disabled:opacity-40">{de ? "Links widerrufen" : "Revoke links"}</button><button type="button" disabled={busy} onClick={() => { if (window.confirm(de ? "Veröffentlichung wirklich löschen?" : "Delete release?")) void run(async () => { await privateMusic.deleteRelease(detail.release.id); setParams({}); }, de ? "Veröffentlichung gelöscht" : "Release deleted"); }} className="inline-flex items-center gap-[5px] rounded-[8px] border border-red-400/30 px-[10px] py-[7px] text-[11px] text-red-300 disabled:opacity-40"><LuTrash2 size={13} />{de ? "Löschen" : "Delete"}</button></div>
            {newLink && <p className="m-0 break-all text-[11px] text-text-secondary">{newLink}</p>}
            <p className="m-0 text-[11px] text-text-tertiary">{de ? "Freigaben gelten nur für angemeldete Empfänger. Ein kopierter Link kann innerhalb von 30 Tagen von bis zu 100 Personen eingelöst werden." : "Shared music is available to signed-in recipients. A link can be claimed by up to 100 people within 30 days."}</p>
          </div>}
        </section>}
      </div>
    </div>
  </div>;
}

function ReleaseRow({ release, active, onClick }: { release: PrivateRelease; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex w-full min-w-0 items-center gap-[10px] rounded-[9px] border px-[9px] py-[9px] text-left hover:bg-white/5 ${active ? "border-accent/40 bg-accent/10" : "border-transparent"}`}><span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[7px] bg-bg-primary text-accent">{release.kind === "single" ? <LuMusic2 size={18} /> : <LuDisc3 size={18} />}</span><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold">{release.title}</span><span className="block truncate text-[11px] text-text-tertiary">{release.artist_name} · {release.kind.toUpperCase()}</span></span></button>;
}

import * as tus from "tus-js-client";
import { getAuthSession } from "@/shared/api";
import { getSupabaseClient } from "@/shared/supabase/client";
import { wavoDb } from "@/shared/storage/wavoDb";
import type { Track } from "@/shared/types";

export const PRIVATE_MUSIC_BUCKET = "wavo-private-music";
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const audioTypes: Record<string, string> = {
  mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", m4a: "audio/mp4",
  aac: "audio/aac", ogg: "audio/ogg", webm: "audio/webm",
};
const coverTypes: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export interface PrivateUpload {
  id: string;
  owner_id: string;
  title: string;
  artist_name: string;
  duration_ms: number;
  mime_type: string;
  byte_size: number;
  storage_path: string;
  created_at: string;
}

export interface PrivateRelease {
  id: string;
  owner_id: string;
  kind: "single" | "ep" | "album";
  title: string;
  artist_name: string;
  description: string;
  cover_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReleaseDetail {
  release: PrivateRelease;
  uploads: PrivateUpload[];
  coverUrl: string;
  tracks: Track[];
}

function myId(): string {
  const id = getAuthSession()?.user?.id;
  if (!id || !UUID.test(id)) throw new Error("Bitte melde dich bei Wavo an.");
  return id;
}

function assertUuid(id: string): void {
  if (!UUID.test(id)) throw new Error("Ungültige Musik-ID.");
}

export function uploadTrackId(id: string): string {
  assertUuid(id);
  return `upload:${id}`;
}

export function parseUploadTrackId(id: string): string | null {
  const match = /^upload:([0-9a-f-]{36})$/i.exec(id);
  return match && UUID.test(match[1]) ? match[1] : null;
}

function extension(file: File, allowed: Record<string, string>, limit: number): { ext: string; mime: string } {
  if (file.size < 1 || file.size > limit) throw new Error(`Datei muss kleiner als ${Math.round(limit / 1024 / 1024)} MB sein.`);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = allowed[ext];
  if (!mime) throw new Error("Dieses Dateiformat wird nicht unterstützt.");
    if (file.type && file.type !== mime && !(ext === "wav" && file.type === "audio/x-wav") &&
      !(ext === "flac" && file.type === "audio/x-flac") &&
      !(ext === "m4a" && ["audio/x-m4a", "audio/m4a"].includes(file.type))) {
    throw new Error("Dateityp und Dateiendung passen nicht zusammen.");
  }
  return { ext, mime };
}

async function durationMs(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = url;
    return await new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const done = (value: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        audio.removeAttribute("src");
        resolve(value);
      };
      audio.addEventListener("loadedmetadata", () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0), { once: true });
      audio.addEventListener("error", () => done(0), { once: true });
      timer = setTimeout(() => done(0), 8000);
    });
  } finally { URL.revokeObjectURL(url); }
}

async function resumableUpload(file: File, path: string, mime: string, onProgress?: (percent: number) => void): Promise<void> {
  const client = getSupabaseClient();
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session?.access_token) throw new Error("Bitte melde dich erneut an.");
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const host = new URL(baseUrl);
  if (host.hostname.endsWith(".supabase.co")) host.hostname = host.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  const endpoint = `${host.origin}/storage/v1/upload/resumable`;
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      headers: { authorization: `Bearer ${session.access_token}` },
      retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: PRIVATE_MUSIC_BUCKET, objectName: path, contentType: mime, cacheControl: "3600" },
      fingerprint: async () => `${path}:${file.name}:${file.size}:${file.lastModified}`,
      onError: reject,
      onProgress: (sent, total) => onProgress?.(Math.round(sent / total * 100)),
      onSuccess: () => resolve(),
    });
    void upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }).catch(reject);
  });
}

async function signedUrl(path: string): Promise<string> {
  const { data, error } = await getSupabaseClient().storage.from(PRIVATE_MUSIC_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw error ?? new Error("Musikdatei nicht erreichbar.");
  return data.signedUrl;
}

export function toPrivateTrack(upload: PrivateUpload, coverUrl = ""): Track {
  return { id: uploadTrackId(upload.id), title: upload.title, artists: upload.artist_name,
    artistList: [{ id: upload.owner_id, name: upload.artist_name }], coverUrl,
    durationMs: upload.duration_ms, playCount: 0 };
}

export const privateMusic = {
  async upload(file: File, title: string, artistName: string, onProgress?: (percent: number) => void): Promise<PrivateUpload> {
    const owner = myId();
    const { ext, mime } = extension(file, audioTypes, MAX_AUDIO_BYTES);
    const cleanTitle = title.trim().slice(0, 200);
    const cleanArtist = artistName.trim().slice(0, 200);
    if (!cleanTitle || !cleanArtist) throw new Error("Titel und Künstler fehlen.");
    const id = crypto.randomUUID();
    const releaseId = crypto.randomUUID();
    const path = `${owner}/audio/${id}.${ext}`;
    await resumableUpload(file, path, mime, onProgress);
    let registered = false;
    try {
      const { data, error } = await getSupabaseClient().from("wavo_uploads").insert({
        id, owner_id: owner, title: cleanTitle, artist_name: cleanArtist,
        duration_ms: await durationMs(file), mime_type: mime, byte_size: file.size, storage_path: path,
      }).select("*").single();
      if (error) throw error;
      registered = true;
      const { error: releaseError } = await getSupabaseClient().from("wavo_releases").insert({
        id: releaseId, owner_id: owner, kind: "single", title: cleanTitle, artist_name: cleanArtist,
      });
      if (releaseError) throw releaseError;
      const { error: itemError } = await getSupabaseClient().from("wavo_release_tracks").insert({
        release_id: releaseId, upload_id: id, position: 0,
      });
      if (itemError) throw itemError;
      void wavoDb.putAudio(uploadTrackId(id), file, mime).catch(() => {});
      return data as PrivateUpload;
    } catch (error) {
      await getSupabaseClient().from("wavo_releases").delete().eq("id", releaseId);
      if (registered) await getSupabaseClient().from("wavo_uploads").delete().eq("id", id);
      await getSupabaseClient().storage.from(PRIVATE_MUSIC_BUCKET).remove([path]);
      throw error;
    }
  },

  async myUploads(): Promise<PrivateUpload[]> {
    const { data, error } = await getSupabaseClient().from("wavo_uploads").select("*")
      .eq("owner_id", myId()).order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return (data ?? []) as PrivateUpload[];
  },

  async releases(): Promise<PrivateRelease[]> {
    myId();
    const { data, error } = await getSupabaseClient().from("wavo_releases").select("*")
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return (data ?? []) as PrivateRelease[];
  },

  async release(id: string): Promise<ReleaseDetail> {
    assertUuid(id);
    const client = getSupabaseClient();
    const { data: release, error } = await client.from("wavo_releases").select("*").eq("id", id).single();
    if (error) throw error;
    const { data: items, error: itemsError } = await client.from("wavo_release_tracks")
      .select("upload_id,position").eq("release_id", id).order("position");
    if (itemsError) throw itemsError;
    const ids = (items ?? []).map((item) => item.upload_id as string);
    const uploads = ids.length ? await client.from("wavo_uploads").select("*").in("id", ids) : { data: [], error: null };
    if (uploads.error) throw uploads.error;
    const byId = new Map(((uploads.data ?? []) as PrivateUpload[]).map((item) => [item.id, item]));
    const ordered = ids.map((uploadId) => byId.get(uploadId)).filter((item): item is PrivateUpload => Boolean(item));
    const coverUrl = release.cover_path ? await signedUrl(release.cover_path).catch(() => "") : "";
    return { release: release as PrivateRelease, uploads: ordered, coverUrl,
      tracks: ordered.map((item) => toPrivateTrack(item, coverUrl)) };
  },

  async createRelease(kind: "ep" | "album", title: string, artistName: string,
    uploadIds: string[], description = "", cover?: File): Promise<string> {
    const owner = myId();
    const cleanTitle = title.trim().slice(0, 200);
    const cleanArtist = artistName.trim().slice(0, 200);
    if (!cleanTitle || !cleanArtist) throw new Error("Titel und Künstler fehlen.");
    if (!uploadIds.length || uploadIds.length > 100 || new Set(uploadIds).size !== uploadIds.length) throw new Error("Wähle 1 bis 100 eigene Songs.");
    uploadIds.forEach(assertUuid);
    const id = crypto.randomUUID();
    const client = getSupabaseClient();
    let coverPath: string | null = null;
    if (cover) {
      const { ext, mime } = extension(cover, coverTypes, MAX_COVER_BYTES);
      coverPath = `${owner}/covers/${id}.${ext}`;
      const { error } = await client.storage.from(PRIVATE_MUSIC_BUCKET).upload(coverPath, cover,
        { contentType: mime, upsert: false });
      if (error) throw error;
    }
    try {
      const { error } = await client.from("wavo_releases").insert({
        id, owner_id: owner, kind, title: cleanTitle, artist_name: cleanArtist,
        description: description.trim().slice(0, 2000), cover_path: coverPath,
      });
      if (error) throw error;
      const { error: tracksError } = await client.from("wavo_release_tracks").insert(uploadIds.map((uploadId, position) => ({
        release_id: id, upload_id: uploadId, position,
      })));
      if (tracksError) throw tracksError;
      return id;
    } catch (error) {
      await client.from("wavo_releases").delete().eq("id", id);
      if (coverPath) await client.storage.from(PRIVATE_MUSIC_BUCKET).remove([coverPath]);
      throw error;
    }
  },

  async shareWithFriend(releaseId: string, friendId: string, message = ""): Promise<void> {
    assertUuid(releaseId);
    assertUuid(friendId);
    const { error } = await getSupabaseClient().rpc("wavo_share_release", {
      p_release_id: releaseId, p_recipient_id: friendId, p_body: message,
    });
    if (error) throw error;
  },

  async createShareLink(releaseId: string): Promise<string> {
    assertUuid(releaseId);
    const { data, error } = await getSupabaseClient().rpc("wavo_create_release_link", { p_release_id: releaseId });
    if (error) throw error;
    if (typeof data !== "string" || !/^[a-f0-9]{64}$/.test(data)) throw new Error("Freigabelink konnte nicht erstellt werden.");
    return `wavo://release?id=${releaseId}&token=${data}`;
  },

  async claimShareLink(token: string): Promise<string> {
    const { data, error } = await getSupabaseClient().rpc("wavo_claim_release_link", { p_token: token });
    if (error) throw error;
    if (typeof data !== "string" || !UUID.test(data)) throw new Error("Ungültiger Freigabelink.");
    return data;
  },

  async revokeLinks(releaseId: string): Promise<void> {
    assertUuid(releaseId);
    const { error } = await getSupabaseClient().from("wavo_release_links").delete().eq("release_id", releaseId);
    if (error) throw error;
  },

  async deleteRelease(releaseId: string): Promise<void> {
    const detail = await this.release(releaseId);
    if (detail.release.owner_id !== myId()) throw new Error("Nur deine eigenen Veröffentlichungen können gelöscht werden.");
    const { error } = await getSupabaseClient().from("wavo_releases").delete().eq("id", releaseId);
    if (error) throw error;
    if (detail.release.cover_path) await getSupabaseClient().storage.from(PRIVATE_MUSIC_BUCKET).remove([detail.release.cover_path]);
  },

  async stream(uploadId: string, signal?: AbortSignal): Promise<{ url: string; mimeType: string; byteSize: number }> {
    assertUuid(uploadId);
    const { data, error } = await getSupabaseClient().from("wavo_uploads")
      .select("storage_path,mime_type,byte_size").eq("id", uploadId).abortSignal(signal ?? new AbortController().signal).single();
    if (error || !data) throw error ?? new Error("Musikdatei nicht verfügbar.");
    return { url: await signedUrl(data.storage_path), mimeType: data.mime_type, byteSize: data.byte_size };
  },
};

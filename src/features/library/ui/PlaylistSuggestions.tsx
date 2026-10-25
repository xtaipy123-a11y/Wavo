import { useEffect, useMemo, useState } from "react";
import { AddLine, CheckLine, MusicLine, Refresh2Line } from "@mingcute/react";
import CoverImage from "@/features/covers/ui/CoverImage";
import { api, toClientTrack } from "@/shared/api";
import type { RadioTrack } from "@/shared/contracts/catalog";
import type { Track } from "@/shared/types";
import { useTranslation } from "@/languages";
import { useToast } from "@/shared/ui";
import { notifyLibraryChanged } from "../hooks/usePlaylists";
import { rankSuggestions } from "./playlistSuggestionRanking";

function selectSeeds(tracks: Track[], offset: number): Track[] {
  const eligible = tracks.filter((track) => track.id && !track.id.startsWith("upload:"));
  if (eligible.length <= 3) return eligible;
  const indexes = [0, Math.floor(eligible.length / 2), eligible.length - 1];
  return indexes.map((index) => eligible[(index + offset) % eligible.length]);
}

interface PlaylistSuggestionsProps {
  playlistId: string;
  tracks: Track[];
}

export default function PlaylistSuggestions({ playlistId, tracks }: PlaylistSuggestionsProps) {
  const { locale, t } = useTranslation();
  const { toast } = useToast();
  const [refresh, setRefresh] = useState(0);
  const [suggestions, setSuggestions] = useState<RadioTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set());
  const labels = locale === "de" ? {
    title: "Passend zu deiner Playlist",
    subtitle: "Entdecke Songs, die zu deiner Musik passen.",
    refresh: "Neue Vorschläge",
    empty: "Gerade keine weiteren Vorschläge verfügbar.",
  } : {
    title: "Made for this playlist",
    subtitle: "Discover songs that fit your music.",
    refresh: "New suggestions",
    empty: "No more suggestions available right now.",
  };

  const seedIds = useMemo(
    () => selectSeeds(tracks, refresh).map((track) => track.id),
    [tracks, refresh],
  );
  const seedKey = seedIds.join("|");
  const existingIds = useMemo(() => new Set(tracks.map((track) => track.id)), [tracks]);

  useEffect(() => {
    if (!seedIds.length) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.allSettled(seedIds.map((id) => api.getRadio(id, { k: 24 })))
      .then((results) => {
        if (cancelled) return;
        const radioLists = results.flatMap((result) => result.status === "fulfilled" ? [result.value.items] : []);
        setSuggestions(rankSuggestions(radioLists, tracks));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // The selected seed IDs define a request. Playlist changes are filtered below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId, seedKey]);

  const visible = suggestions.filter((track) => !existingIds.has(track.id));
  const addTrack = async (track: RadioTrack) => {
    if (addingId || existingIds.has(track.id) || addedIds.has(track.id)) return;
    setAddingId(track.id);
    try {
      await api.addPlaylistTrack(playlistId, track.id, track);
      setAddedIds((previous) => new Set(previous).add(track.id));
      notifyLibraryChanged();
      toast(t("common.added_to_playlist"), "success");
    } catch {
      toast(t("common.failed_add_playlist"), "error");
    } finally {
      setAddingId(null);
    }
  };

  if (!seedIds.length) return null;

  return (
    <section className="mt-[36px] mb-[24px] min-w-0" aria-label={labels.title}>
      <div className="mb-[14px] flex flex-wrap items-end justify-between gap-[10px] px-[12px]">
        <div>
          <h2 className="m-0 text-[19px] font-[700] text-text-primary">{labels.title}</h2>
          <p className="m-0 mt-[3px] text-[12px] text-text-tertiary">{labels.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setRefresh((value) => value + 1)}
          disabled={loading}
          className="inline-flex items-center gap-[6px] rounded-md border border-border-primary/60 bg-bg-panel/50 px-[10px] py-[6px] text-[12px] font-[600] text-text-secondary transition-colors hover:bg-bg-panel hover:text-text-primary disabled:opacity-50"
        >
          <Refresh2Line size={15} className={loading ? "animate-spin" : ""} />
          {labels.refresh}
        </button>
      </div>
      {loading && visible.length === 0 ? (
        <div className="space-y-[5px]" aria-busy="true">
          {[0, 1, 2].map((index) => <div key={index} className="h-[58px] animate-pulse rounded-lg bg-bg-panel/60" />)}
        </div>
      ) : visible.length ? (
        <div className="space-y-[3px]">
          {visible.map((track) => {
            const clientTrack = toClientTrack(track);
            return (
              <div key={track.id} className="group flex min-w-0 items-center gap-[11px] rounded-lg px-[10px] py-[6px] transition-colors hover:bg-bg-panel/65">
                <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-bg-panel">
                  {clientTrack.coverUrl ? <CoverImage src={clientTrack.coverUrl} alt="" width={42} height={42} className="h-full w-full object-cover" /> : <MusicLine size={20} className="text-text-tertiary" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[13px] font-[600] text-text-primary">{track.title}</p>
                  <p className="m-0 truncate text-[11px] text-text-tertiary">{clientTrack.artists}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void addTrack(track)}
                  disabled={addingId !== null || addedIds.has(track.id)}
                  aria-label={`${t("common.add_to_playlist")}: ${track.title}`}
                  title={t("common.add_to_playlist")}
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-border-primary/70 text-text-secondary transition-colors hover:border-text-primary hover:bg-bg-panel hover:text-text-primary disabled:opacity-50"
                >
                  {addingId === track.id ? <span className="h-[15px] w-[15px] animate-spin rounded-full border-2 border-current border-t-transparent" /> : addedIds.has(track.id) ? <CheckLine size={19} /> : <AddLine size={19} />}
                </button>
              </div>
            );
          })}
        </div>
      ) : <p className="m-0 px-[12px] py-[16px] text-[12px] text-text-tertiary">{labels.empty}</p>}
    </section>
  );
}

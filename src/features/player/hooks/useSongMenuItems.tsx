import { useCallback } from "react";
import {
  LuRadio,
  LuStepForward,
  LuListPlus,
  LuHeart,
  LuPlus,
  LuTrash2,
  LuFolderPlus,
  LuDownload,
  LuCheck,
} from "react-icons/lu";
import type { DropdownMenuItem } from "@/shared/ui/DropdownMenu";
import { playerEngine } from "../engine/playerEngine";
import {
  usePlaylistsList,
  useLikeTrack,
  useUnlikeTrack,
  useIsTrackLiked,
  useModalStore,
} from "@/features/library";
import { useTranslation } from "@/languages";
import { showToast } from "@/shared/ui";
import { useDownloadStore } from "@/features/downloads/downloadStore";

export interface SongMenuContext {
  id?: string;
  title: string;
  artists: string;
  coverUrl: string;
  duration?: string;
  durationMs?: number;
  searchType?: "track" | "album" | "artist" | "playlist";
  totalTracks?: number;
  playlistId?: string;
  playlistItemId?: string;
  playlistTitle?: string;
}

export function useSongMenuItems(ctx: SongMenuContext): DropdownMenuItem[] {
  const { t, locale } = useTranslation();
  const {
    id,
    title,
    artists,
    coverUrl,
    duration,
    durationMs,
    searchType,
    totalTracks,
    playlistId,
    playlistItemId,
    playlistTitle,
  } = ctx;

  const { data: playlistsData } = usePlaylistsList();

  const likeMutation = useLikeTrack();
  const unlikeMutation = useUnlikeTrack();

  const liked = useIsTrackLiked(id);
  const downloaded = useDownloadStore((state) => Boolean(id && state.tracks.some((track) => track.id === id)));
  const downloadStatus = useDownloadStore((state) => id ? state.statusById[id] : undefined);

  const handleLike = useCallback(async () => {
    if (!id) return;
    if (liked) {
      unlikeMutation.mutate(id);
    } else {
      likeMutation.mutate({ trackId: id, title, artists, coverUrl, durationMs });
    }
  }, [id, liked, likeMutation, unlikeMutation, title, artists, coverUrl, durationMs]);

  const buildMenu = useCallback((): DropdownMenuItem[] => {
    const isTrack = searchType === "track" || !searchType;

    const offlineItem: DropdownMenuItem = {
      id: downloaded ? "remove-download" : "download-track",
      label: downloadStatus === "downloading"
        ? (locale === "de" ? "Download abbrechen" : "Cancel download")
        : downloaded
          ? (locale === "de" ? "Download entfernen" : "Remove download")
          : (locale === "de" ? "Offline speichern" : "Download for offline"),
      icon: downloaded ? <LuCheck size={15} /> : <LuDownload size={15} />,
      disabled: !id || downloadStatus === "removing",
      onClick: async () => {
        if (!id) return;
        const store = useDownloadStore.getState();
        if (downloadStatus === "downloading") { store.cancel(id); return; }
        try {
          if (downloaded) {
            await store.remove(id);
            showToast(locale === "de" ? "Download entfernt" : "Download removed", "checkmark");
          } else {
            await store.download({ id, title, artists, coverUrl, durationMs: durationMs ?? 0, playCount: 0 });
            showToast(locale === "de" ? "Offline gespeichert" : "Saved for offline", "checkmark", { description: title });
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          showToast(locale === "de" ? "Download fehlgeschlagen" : "Download failed", "error", {
            description: error instanceof Error ? error.message : undefined,
          });
        }
      },
    };

    if (isTrack) {
      if (playlistId) {
        return [
          {
            id: "start-radio",
            label: t("common.start_radio"),
            icon: <LuRadio size={15} />,
            onClick: () => {
              if (!id) return;
              void playerEngine.startRadioStation({
                id,
                title,
                artists,
                coverUrl,
                durationMs: durationMs ?? 0,
                playCount: 0,
              });
            },
          },
          {
            id: "play-next",
            label: t("common.play_next"),
            icon: <LuStepForward size={15} />,
            onClick: () => {
              if (!id) return;
              playerEngine.playNext({
                id,
                title,
                artists,
                coverUrl,
                durationMs: durationMs ?? 0,
                playCount: 0,
              });
            },
          },
          {
            id: "add-to-queue",
            label: t("common.add_to_queue"),
            icon: <LuListPlus size={15} />,
            onClick: () => {
              if (!id) return;
              playerEngine.addToQueue({
                id,
                title,
                artists,
                coverUrl,
                durationMs: durationMs ?? 0,
                playCount: 0,
              });
              showToast(t("common.added_to_queue"), "checkmark", {
                description: artists ? `${title} — ${artists}` : title,
              });
            },
          },
          offlineItem,
          {
            id: liked ? "unlike-track" : "like-track",
            label: liked ? t("common.unlike") : t("common.like"),
            icon: (
              <LuHeart
                size={15}
                className={liked ? "fill-red-500 text-red-500" : "text-text-secondary"}
              />
            ),
            onClick: handleLike,
          },
          {
            id: "remove-from-playlist",
            label: t("common.remove_from_playlist"),
            icon: <LuTrash2 size={15} />,
            danger: true,
            onClick: () => {
              if (!id) return;
              useModalStore.getState().openRemoveFromPlaylist({
                trackId: id,
                playlistItemId,
                trackTitle: title,
                trackArtists: artists,
                trackCoverUrl: coverUrl,
                playlistId,
                playlistTitle,
              });
            },
          },
        ];
      }

      return [
        {
          id: "start-radio",
          label: t("common.start_radio"),
          icon: <LuRadio size={15} />,
          onClick: () => {
            if (!id) return;
            void playerEngine.startRadioStation({
              id,
              title,
              artists,
              coverUrl,
              durationMs: durationMs ?? 0,
              playCount: 0,
            });
          },
        },
        {
          id: "play-next",
          label: t("common.play_next"),
          icon: <LuStepForward size={15} />,
          onClick: () => {
            if (!id) return;
            playerEngine.playNext({
              id,
              title,
              artists,
              coverUrl,
              durationMs: durationMs ?? 0,
              playCount: 0,
            });
          },
        },
        {
          id: "add-to-queue",
          label: t("common.add_to_queue"),
          icon: <LuListPlus size={15} />,
          onClick: () => {
            if (!id) return;
            playerEngine.addToQueue({
              id,
              title,
              artists,
              coverUrl,
              durationMs: durationMs ?? 0,
              playCount: 0,
            });
            showToast(t("common.added_to_queue"), "checkmark", {
              description: artists ? `${title} — ${artists}` : title,
            });
          },
        },
        offlineItem,
        {
          id: liked ? "unlike-track" : "like-track",
          label: liked ? t("common.unlike") : t("common.like"),
          icon: (
            <LuHeart
              size={15}
              className={liked ? "fill-red-500 text-red-500" : "text-text-secondary"}
            />
          ),
          onClick: handleLike,
        },
        {
          id: "add-to-playlist",
          label: t("common.add_to_playlist"),
          icon: <LuPlus size={15} />,
          onClick: () => {
            if (!id) return;
            useModalStore.getState().openAddToPlaylist({
              id,
              title,
              artists,
              coverUrl,
              duration,
              playlists: playlistsData?.playlists ?? [],
            });
          },
        },
      ];
    }

    return [
      {
        id: "add-to-library",
        label: t("common.add_to_library"),
        icon: <LuFolderPlus size={15} />,
        onClick: () => {
          if (!id) return;
          useModalStore.getState().openAddToLibrary({
            id,
            title,
            coverUrl,
            type: (searchType as "album" | "artist" | "playlist") || "album",
            subtitle: artists,
            totalTracks,
          });
        },
      },
    ];
  }, [
    id,
    title,
    artists,
    coverUrl,
    duration,
    durationMs,
    searchType,
    totalTracks,
    playlistId,
    playlistItemId,
    playlistTitle,
    liked,
    handleLike,
    playlistsData,
    t,
    locale,
    downloaded,
    downloadStatus,
  ]);

  return buildMenu();
}

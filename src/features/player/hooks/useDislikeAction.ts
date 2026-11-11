import { useCallback } from "react";
import { useTranslation } from "@/languages";
import { showToast } from "@/shared/ui";
import {
  getDislikeOwnerId,
  useDislikeStore,
} from "@/features/library/store/dislikeStore";
import { playerEngine } from "../engine/playerEngine";

export interface DislikeTarget {
  id: string;
  title: string;
  artists: string;
  coverUrl: string;
  durationMs?: number;
}

/** Shared dislike toggle used by the row button and the song context menu. */
export function useDislikeAction() {
  const { t } = useTranslation();

  return useCallback(
    (track: DislikeTarget) => {
      const ownerId = getDislikeOwnerId();
      const nowDisliked = useDislikeStore.getState().toggleDislike(ownerId, {
        id: track.id,
        title: track.title,
        artists: track.artists,
        coverUrl: track.coverUrl,
        durationMs: track.durationMs ?? 0,
        playCount: 0,
      });
      const description = track.artists
        ? `${track.title} — ${track.artists}`
        : track.title;

      if (!nowDisliked) {
        showToast(t("common.disliked_removed"), "checkmark", { description });
        return;
      }

      playerEngine.removeTrackFromQueue(track.id);
      showToast(t("common.disliked_added"), "checkmark", {
        description,
        action: {
          label: t("common.undo"),
          onClick: () =>
            useDislikeStore
              .getState()
              .removeDislike(getDislikeOwnerId(), track.id),
        },
      });
    },
    [t],
  );
}

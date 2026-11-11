import { memo } from "react";
import { LuMinus } from "react-icons/lu";
import { useTranslation } from "@/languages";
import { useIsTrackDisliked } from "@/features/library/store/dislikeStore";
import { useDislikeAction } from "../hooks/useDislikeAction";

interface TrackDislikeButtonProps {
  id: string;
  title: string;
  artists: string;
  coverUrl: string;
  durationMs?: number;
}

function TrackDislikeButton({
  id,
  title,
  artists,
  coverUrl,
  durationMs,
}: TrackDislikeButtonProps) {
  const { t } = useTranslation();
  const disliked = useIsTrackDisliked(id);
  const toggleDislike = useDislikeAction();

  return (
    <button
      type="button"
      aria-label={disliked ? t("common.remove_dislike") : t("common.dislike")}
      aria-pressed={disliked}
      title={disliked ? t("common.remove_dislike") : t("common.dislike")}
      data-prevent-drag
      className={`flex items-center justify-center rounded-md border-0 bg-transparent p-0 transition-all duration-200 active:scale-[0.96] cursor-pointer ${
        disliked
          ? "scale-110 text-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.45)] hover:text-red-400"
          : "text-red-400/50 hover:text-red-400"
      }`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleDislike({ id, title, artists, coverUrl, durationMs });
      }}
    >
      <LuMinus size={20} strokeWidth={disliked ? 3 : 2.25} />
    </button>
  );
}

export default memo(TrackDislikeButton);

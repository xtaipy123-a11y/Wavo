import { LuDownload, LuLoaderCircle } from "react-icons/lu";
import { useTranslation } from "@/languages";
import { showToast } from "@/shared/ui/Toast";
import type { Track } from "@/shared/types";
import { useDownloadStore } from "./downloadStore";

export function OfflineDownloadButton({ tracks, compact = false, className = "" }: {
  tracks: Track[];
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const saved = useDownloadStore((state) => state.tracks);
  const statuses = useDownloadStore((state) => state.statusById);
  const hydrated = useDownloadStore((state) => state.hydrated);
  const unique = [...new Map(tracks.map((track) => [track.id, track])).values()];
  const savedIds = new Set(saved.map((track) => track.id));
  const remaining = unique.filter((track) => !savedIds.has(track.id));
  const busy = unique.some((track) => Boolean(statuses[track.id]));

  if (!hydrated || !remaining.length) return null;

  const label = busy ? t("downloads.downloading") : t("downloads.save_offline");
  const download = async () => {
    const result = await useDownloadStore.getState().downloadMany(remaining);
    if (result.failed) {
      showToast(t("downloads.failed"), "error", { description: t("downloads.failed_count", { count: result.failed }) });
    } else {
      showToast(t("downloads.saved"), "checkmark", { description: compact ? tracks[0]?.title : undefined });
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      aria-label={compact ? `${label}: ${tracks[0]?.title}` : label}
      title={label}
      data-no-window-drag
      onClick={(event) => { event.stopPropagation(); void download(); }}
      className={`inline-flex shrink-0 items-center justify-center gap-[7px] rounded-lg border-0 text-text-secondary transition-colors hover:bg-border-alpha-14 hover:text-text-primary disabled:cursor-wait disabled:opacity-60 ${compact ? "h-[30px] w-[30px] bg-transparent" : "min-h-[36px] w-full bg-border-alpha-10 px-[12px] text-[13px] font-medium"} ${className}`}
    >
      {busy ? <LuLoaderCircle size={16} className="animate-spin" /> : <LuDownload size={16} />}
      {!compact && <span>{label}{busy ? ` (${unique.length - remaining.length}/${unique.length})` : ""}</span>}
    </button>
  );
}

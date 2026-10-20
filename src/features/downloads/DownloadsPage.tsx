import { useEffect } from "react";
import { Link } from "react-router-dom";
import { LuArrowLeft, LuDownload, LuMusic2, LuPlay, LuTrash2 } from "react-icons/lu";
import { playerEngine } from "@/features/player";
import { useDownloadStore } from "./downloadStore";
import { useTranslation } from "@/languages";
import { useToast } from "@/shared/ui";

export default function DownloadsPage() {
  const { locale } = useTranslation();
  const de = locale === "de";
  const { toast } = useToast();
  const tracks = useDownloadStore((state) => state.tracks);
  const hydrated = useDownloadStore((state) => state.hydrated);
  const statusById = useDownloadStore((state) => state.statusById);

  useEffect(() => { void useDownloadStore.getState().hydrate(); }, []);

  const remove = async (id: string) => {
    try {
      await useDownloadStore.getState().remove(id);
      toast(de ? "Download entfernt" : "Download removed", "checkmark");
    } catch (error) {
      toast(de ? "Download konnte nicht entfernt werden" : "Could not remove download", "error", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="mx-auto max-w-[1000px] px-[clamp(16px,4vw,36px)] py-[28px] text-text-primary" data-no-window-drag>
      <Link to="/library" className="mb-[25px] inline-flex items-center gap-[7px] text-[12px] text-text-secondary hover:text-text-primary">
        <LuArrowLeft size={16} />{de ? "Zur Bibliothek" : "Back to library"}
      </Link>
      <div className="mb-[24px] flex items-center gap-[15px]">
        <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[15px] bg-accent/20 text-accent"><LuDownload size={25} /></div>
        <div className="min-w-0"><h1 className="m-0 text-[26px] font-bold">{de ? "Downloads" : "Downloads"}</h1><p className="m-0 text-[13px] text-text-secondary">{de ? "Deine Musik auf diesem Gerät – auch ohne Internet" : "Your music on this device, even without internet"}</p></div>
      </div>
      {!hydrated ? <p className="text-[13px] text-text-tertiary">{de ? "Downloads werden geladen …" : "Loading downloads …"}</p>
        : !tracks.length ? <div className="rounded-[16px] border border-border-alpha-15 bg-bg-secondary/70 px-[24px] py-[52px] text-center"><LuMusic2 size={34} className="mx-auto mb-[10px] text-text-tertiary" /><p className="m-0 text-[15px] font-semibold">{de ? "Noch keine Songs heruntergeladen" : "No downloaded songs yet"}</p><p className="mb-0 mt-[6px] text-[12px] text-text-tertiary">{de ? "Öffne einen Song im Vollbildplayer und klicke auf „Offline speichern“." : "Open a song in the fullscreen player and click “Download for offline”."}</p></div>
        : <>
          <p className="mb-[12px] text-[12px] text-text-tertiary">{tracks.length} {de ? "Songs auf diesem Gerät" : "songs on this device"}</p>
          <div className="overflow-hidden rounded-[16px] border border-border-alpha-15 bg-bg-secondary/70">
            {tracks.map((track) => <div key={track.id} className="flex items-center gap-[10px] border-b border-border-alpha-15 px-[14px] py-[10px] last:border-b-0">
              <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-bg-primary">{track.coverUrl ? <img src={track.coverUrl} alt="" className="h-full w-full object-cover" /> : <LuMusic2 size={20} className="text-text-tertiary" />}</div>
              <div className="min-w-0 flex-1"><p className="m-0 truncate text-[13px] font-semibold">{track.title}</p><p className="m-0 truncate text-[11px] text-text-tertiary">{track.artists}</p></div>
              <span className="hidden text-[11px] text-accent sm:inline">{de ? "Offline" : "Offline"}</span>
              <button type="button" title={de ? "Abspielen" : "Play"} aria-label={`${de ? "Abspielen" : "Play"}: ${track.title}`} onClick={() => void playerEngine.playTrack(track, tracks, "downloads")} className="rounded-[8px] p-[9px] text-text-primary hover:bg-white/10"><LuPlay size={17} /></button>
              <button type="button" disabled={Boolean(statusById[track.id])} title={de ? "Download entfernen" : "Remove download"} aria-label={`${de ? "Download entfernen" : "Remove download"}: ${track.title}`} onClick={() => void remove(track.id)} className="rounded-[8px] p-[9px] text-text-tertiary hover:bg-white/10 hover:text-red-400 disabled:opacity-40"><LuTrash2 size={16} /></button>
            </div>)}
          </div>
        </>}
    </div>
  );
}

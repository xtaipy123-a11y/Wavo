import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, toClientTrack } from "@/shared/api";
import { useToast } from "@/shared/ui";
import { useTranslation } from "@/languages";
import { playerEngine } from "@/features/player";
import { decodePlaylistShareToken, importSharedPlaylist } from "@/features/library/services/playlistShare";
import { setPendingReleaseToken } from "./pendingReleaseLink";

interface DeeplinkTarget {
  type: "artist" | "album" | "playlist" | "track" | "release";
  id: string;
  token?: string;
  data?: string;
}

// user playlist ids are uuids or pl- tokens, everything else is a catalog id
function isUserPlaylistId(id: string): boolean {
  return (
    id.startsWith("pl-") ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
}

// opens shared entities arriving via wavo:// deeplinks (main pre-validates)
export default function DeeplinkHandler() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    const off = window.wavoElectron?.onDeeplink((target: DeeplinkTarget) => {
      void (async () => {
        try {
          switch (target.type) {
            case "release":
              if (target.token) {
                setPendingReleaseToken(target.token);
                navigate(`/uploads?claim=${encodeURIComponent(target.token)}`);
              }
              break;
            case "artist":
              navigate(`/artist?id=${encodeURIComponent(target.id)}`);
              break;
            case "album":
              navigate(`/collection?type=album&id=${encodeURIComponent(target.id)}`);
              break;
            case "playlist":
              if (target.data) {
                const payload = await decodePlaylistShareToken(target.data);
                if (!payload) {
                  toast(t("playlist.share_link_invalid"), "error");
                  break;
                }
                try {
                  const { playlistId } = await importSharedPlaylist(payload);
                  window.dispatchEvent(new Event("library:changed"));
                  toast(t("playlist.share_link_imported"), "checkmark", { description: payload.title });
                  navigate(`/library/playlist?id=${encodeURIComponent(playlistId)}`);
                } catch {
                  toast(t("playlist.share_link_failed"), "error");
                }
                break;
              }
              navigate(`/collection?type=playlist&id=${encodeURIComponent(target.id)}`);
              break;
            case "track": {
              const track = toClientTrack(await api.getTrack(target.id));
              playerEngine.playTrack(track, [track], track.artists, track.coverUrl);
              navigate("/player");
              break;
            }
          }
        } catch {
          // unknown id or offline, stay where we are
        }
      })();
    });
    return off;
  }, [navigate, toast, t]);

  return null;
}

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PopularTracksSection from "./PopularTracksSection";
import HomePageSkeleton from "./HomePageSkeleton";
import DailyMixesSection from "./DailyMixesSection";
import { useHomeDiscovery } from "../hooks/useHomeDiscovery";
import { useRecentlyPlayed } from "../hooks/useRecentlyPlayed";
import { useDailyMixes } from "../hooks/useDailyMixes";
import { useRecommendations } from "../hooks/useRecommendations";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useLikedTracks } from "@/features/library/hooks/useLikedTracks";
import { playerEngine } from "@/features/player";
import SongCard from "@/features/player/ui/SongCard";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import { useTranslation } from "@/languages";
import { useIsContentTransparent } from "@/features/settings/store/customizationStore";
import {
  FireFill,
  TimeFill,
  AlbumFill,
  PlaylistFill,
  HeartFill,
  FlashCircleFill,
  SparklesFill,
} from "@mingcute/react";

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hasCustomBg = useIsContentTransparent();
  const { data: likedData } = useLikedTracks();

  const user = useAuthStore(state => state.user);
  const { data: discovery, isLoading, error, retry } = useHomeDiscovery();
  const { data: recentlyPlayed, isLoading: recentLoading } = useRecentlyPlayed(20);
  const { data: dailyMixes } = useDailyMixes();
  const { data: recommended } = useRecommendations({
    recent: recentlyPlayed,
    recentLoading,
    fallback: discovery.tracks,
  });
  const hasDiscovery =
    discovery.tracks.length > 0 ||
    discovery.albums.length > 0 ||
    discovery.artists.length > 0 ||
    discovery.categoryShelves.length > 0 ||
    discovery.playlistShelves.length > 0;
  const hour = new Date().getHours();
  const greeting = t(`home.${hour < 5 ? "goodNight" : hour < 12 ? "goodMorning" : hour < 17 ? "goodAfternoon" : hour < 22 ? "goodEvening" : "goodNight"}`);
  const name = user?.displayName || user?.username;

  // Ambient time-of-day colored glow
  const glowClass = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return "from-amber-500/20 via-orange-500/10 to-transparent";
    } else if (hour >= 12 && hour < 17) {
      return "from-amber-400/20 via-sky-500/10 to-transparent";
    } else if (hour >= 17 && hour < 22) {
      return "from-rose-500/20 via-purple-500/10 to-transparent";
    }
    return "from-indigo-600/25 via-violet-600/15 to-transparent";
  }, []);

  // Quick mix items: up to 5 recently played items (tracks or albums)
  const quickRecentItems = useMemo(() => {
    return (recentlyPlayed || []).slice(0, 5);
  }, [recentlyPlayed]);

  const quickCardClass = hasCustomBg
    ? "apple-glass-action"
    : "bg-bg-elevated hover:bg-[#dedee3] dark:hover:bg-border-alpha-14 transition-colors duration-150 ease-out";

  return (
    <div className="relative h-full w-full overflow-y-auto overflow-x-hidden bg-transparent">

      <div
        data-window-drag
        className="sticky top-0 z-20 h-[32px] w-full shrink-0 select-none pointer-events-auto"
        style={{ marginBottom: "-32px" }}
        aria-hidden="true"
      />
      {!hasCustomBg && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -top-8 -left-8 w-[380px] h-[200px] bg-gradient-to-br ${glowClass} blur-3xl opacity-60`}
        />
      )}

      <div className="relative z-1 w-full pb-[32px]">
        <div className="flex flex-col">
          <div className="mt-[20px] px-8 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center shrink-0">
                <FlashCircleFill className="w-5 h-5 text-amber-400" />
              </div>
              <h2
                className="text-text-primary text-[21px] font-semibold m-0 leading-tight tracking-tight truncate"
                style={{ fontFamily: "var(--font-inter), sans-serif" }}
              >
                {greeting}{name ? `, ${name}` : ""}
              </h2>
            </div>
          </div>

          <div className="px-8 mt-[12px] relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <SongCard
              title={t("library.liked_songs")}
              artists={`${likedData.total} ${likedData.total === 1 ? t("library.song") : t("library.songs")}`}
              artistsClickable={false}
              coverUrl=""
              icon={<HeartFill size={22} className={hasCustomBg ? "text-white/80" : "text-zinc-400 dark:text-zinc-500"} />}
              onPlay={() => navigate("/library/playlist?id=likes")}
              compact
              className={quickCardClass}
            />

            {/* Recently Played Quick Cards */}
            {quickRecentItems.map((entry, idx) => {
              if (entry.type === "album") {
                const album = entry.item;
                return (
                  <SongCardWithMenu
                    key={`quick-album-${album.id}-${idx}`}
                    id={album.id}
                    title={album.title}
                    artists={album.artist}
                    coverUrl={album.coverUrl ?? ""}
                    onPlay={() =>
                      navigate(
                        `/collection?type=album&id=${encodeURIComponent(album.id)}`,
                      )
                    }
                    searchType="album"
                    compact
                    className={quickCardClass}
                  />
                );
              }
              if (entry.type === "track") {
                const track = entry.item;
                return (
                  <SongCardWithMenu
                    key={`quick-track-${track.id}-${idx}`}
                    id={track.id}
                    title={track.title}
                    artists={track.artists}
                    coverUrl={track.coverUrl ?? ""}
                    durationMs={track.durationMs}
                    explicit={track.explicit}
                    onPlay={() => {
                      void playerEngine.playTrack(
                        track,
                        [track],
                        `${track.title} Radio`,
                        track.coverUrl,
                      );
                    }}
                    searchType="track"
                    compact
                    className={quickCardClass}
                  />
                );
              }
              return null;
            })}
          </div>
        </div>

        {isLoading && !hasDiscovery && <HomePageSkeleton glowClass={glowClass} showQuickGrid={false} />}
        {error && !hasDiscovery && (
          <div role="status" className="mx-8 mt-8 rounded-xl bg-bg-elevated p-5 text-text-secondary">
            <p>{t("home.discoveryUnavailable")}</p>
            <button type="button" onClick={retry} className="mt-3 cursor-pointer text-text-primary underline">{t("home.retry")}</button>
          </div>
        )}

        {/* Discover: fresh tracks and music videos from the YouTube Music charts */}
        {discovery.tracks.length > 0 && (
          <PopularTracksSection
            title={t("home.discover")}
            icon={<FireFill className="w-5 h-5 text-amber-500" />}
            items={discovery.tracks}
            headingMarginTop="mt-[22px]"
          />
        )}

        {/* Daily Mixes (Made For You) */}
        {dailyMixes && dailyMixes.length > 0 && (
          <DailyMixesSection
            mixes={dailyMixes}
            headingMarginTop="mt-[22px]"
          />
        )}

        {/* Recommendations derived from likes, history and own playlists */}
        {recommended.length > 0 && (
          <PopularTracksSection
            title={t("home.recommendedForYou")}
            subtitle={t("home.recommendedForYouSubtitle")}
            icon={<SparklesFill className="w-5 h-5 text-fuchsia-400" />}
            items={recommended}
            headingMarginTop="mt-[22px]"
          />
        )}

        {/* Jump Back In (History) */}
        {recentlyPlayed && recentlyPlayed.length > 0 && (
          <PopularTracksSection
            title={t("home.jumpBackIn")}
            icon={<TimeFill className="w-5 h-5 text-sky-400" />}
            items={recentlyPlayed}
            headingMarginTop="mt-[22px]"
          />
        )}

        {/* New releases */}
        {discovery.albums.length > 0 && (
          <PopularTracksSection
            title={t("home.newReleases")}
            icon={<AlbumFill className="w-5 h-5 text-emerald-400" />}
            items={discovery.albums}
            headingMarginTop="mt-[22px]"
          />
        )}

        {/* Charting artists */}
        {discovery.artists.length > 0 && (
          <PopularTracksSection
            title={t("home.topArtists")}
            icon={<FlashCircleFill className="w-5 h-5 text-violet-400" />}
            items={discovery.artists}
            headingMarginTop="mt-[22px]"
          />
        )}

        {/* Rotating mood/genre shelves picked at app start */}
        {discovery.categoryShelves.map((shelf) => (
          <PopularTracksSection
            key={shelf.key}
            title={shelf.title}
            icon={<PlaylistFill className="w-5 h-5 text-cyan-400" />}
            items={shelf.items}
            headingMarginTop="mt-[22px]"
          />
        ))}

        {/* Curated playlist shelves from the YouTube Music home feed */}
        {discovery.playlistShelves.map((shelf) => (
          <PopularTracksSection
            key={shelf.key}
            title={shelf.title || t("home.forYou")}
            icon={<PlaylistFill className="w-5 h-5 text-rose-400" />}
            items={shelf.items}
            headingMarginTop="mt-[22px]"
          />
        ))}
      </div>
    </div>
  );
}

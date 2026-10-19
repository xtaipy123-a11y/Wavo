import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PopularTracksSection from "./PopularTracksSection";
import DailyMixesSection from "./DailyMixesSection";
import {
  usePopular,
  usePopularTracksOnly,
  usePopularTracksAllTime,
} from "../hooks/usePopularTracks";
import { useRecentlyPlayed } from "../hooks/useRecentlyPlayed";
import { useDailyMixes } from "../hooks/useDailyMixes";
import { useLikedTracks } from "@/features/library/hooks/useLikedTracks";
import { useModalStore } from "@/features/library";
import { playerEngine } from "@/features/player";
import SongCard from "@/features/player/ui/SongCard";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import { useTranslation } from "@/languages";
import { useIsContentTransparent } from "@/features/settings/store/customizationStore";
import {
  FireFill,
  TrophyFill,
  TimeFill,
  AlbumFill,
  PlaylistFill,
  HeartFill,
  FlashCircleFill,
  Search2Line,
} from "@mingcute/react";

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hasCustomBg = useIsContentTransparent();
  const openSearch = useModalStore((state) => state.openSearch);
  const { data: likedData, isLoading: likedLoading } = useLikedTracks();

  const { data: popularItems, isLoading: popularLoading } = usePopular(30);
  const { data: popularTracksOnly, isLoading: tracksLoading } =
    usePopularTracksOnly(20);
  const { data: popularTracksAllTime, isLoading: allTimeLoading } =
    usePopularTracksAllTime(20);
  const { data: recentlyPlayed, isLoading: recentLoading } =
    useRecentlyPlayed(20);
  const { data: dailyMixes, isLoading: dailyLoading } = useDailyMixes();

  const isDataLoading = tracksLoading || likedLoading || popularLoading || allTimeLoading || recentLoading || dailyLoading;

  const popularAlbums =
    popularItems?.filter((it) => it.type === "album") ?? [];
  const popularPlaylists =
    popularItems?.filter((it) => it.type === "playlist") ?? [];
  const popularArtists =
    popularItems?.filter((it) => it.type === "artist") ?? [];
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return t("home.goodMorning");
    if (hour >= 12 && hour < 17) return t("home.goodAfternoon");
    if (hour >= 17 && hour < 22) return t("home.goodEvening");
    return t("home.goodNight");
  }, [t]);

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

  const hasQuickData = quickRecentItems.length > 0 || likedData.total > 0;
  const hasPersonalContent = hasQuickData || dailyMixes.length > 0;
  const hasDiscoveryContent = popularTracksOnly.length > 0 || popularTracksAllTime.length > 0 || popularArtists.length > 0 || popularAlbums.length > 0 || popularPlaylists.length > 0;
  const isEmpty = !hasPersonalContent && !hasDiscoveryContent && !isDataLoading;

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
            <div className="px-8 pt-[48px] pb-[10px]">
              <div className={`relative overflow-hidden rounded-[20px] border border-border-primary px-6 py-6 sm:px-8 sm:py-7 ${hasCustomBg ? "apple-glass-action" : "bg-bg-elevated/80"}`}>
                <div aria-hidden="true" className={`pointer-events-none absolute -right-12 -top-20 h-56 w-72 rounded-full bg-gradient-to-br ${glowClass} blur-2xl`} />
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">Wavo</span>
                    <h1 className="mt-2 mb-1 text-[28px] font-semibold leading-tight tracking-tight text-text-primary sm:text-[32px]" style={{ fontFamily: "var(--font-inter), sans-serif" }}>{greeting}</h1>
                    <p className="m-0 text-[13px] text-text-secondary">{t("home.heroSubtitle")}</p>
                  </div>
                  <button type="button" onClick={openSearch} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-border-primary bg-bg-primary/80 px-4 text-[13px] font-medium text-text-primary transition-colors hover:bg-border-alpha-14">
                    <Search2Line size={17} />
                    {t("home.searchMusic")}
                  </button>
                </div>
              </div>
            </div>

            {isDataLoading && !hasPersonalContent && !hasDiscoveryContent && (
              <div className="grid grid-cols-1 gap-3 px-8 pt-5 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("common.loading")}>
                {[0, 1, 2].map((index) => (
                  <div key={index} className="h-[72px] animate-pulse rounded-xl border border-border-primary bg-bg-elevated/60" />
                ))}
              </div>
            )}

            {isEmpty && (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 px-8 text-center">
                <FlashCircleFill className="h-9 w-9 text-amber-400" />
                <p className="m-0 text-text-secondary">{t("home.emptyTitle")}</p>
                <button type="button" onClick={openSearch} className="rounded-full bg-text-primary px-5 py-2 text-bg-primary">
                  {t("common.sidebar.search")}
                </button>
              </div>
            )}

            {hasPersonalContent && (
              <div className="mt-5 flex items-center gap-3 px-8">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">{t("home.forYou")}</span>
                <span className="h-px flex-1 bg-border-primary" />
              </div>
            )}

            {hasQuickData && (
              <div className="flex flex-col">
              <div className="mt-[20px] px-8 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center shrink-0">
                    <FlashCircleFill className="w-5 h-5 text-amber-400" />
                    </div>
                    <h2
                      className="text-text-primary text-[21px] font-semibold m-0 leading-tight tracking-tight"
                      style={{ fontFamily: "var(--font-inter), sans-serif" }}
                    >
                      {t("home.speedDial") || "Speed dial"}
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
            )}

            {/* Daily Mixes (Made For You) */}
            {dailyMixes && dailyMixes.length > 0 && (
              <DailyMixesSection
                mixes={dailyMixes}
                headingMarginTop="mt-[22px]"
              />
            )}

          {/* Your listening history */}
          {recentlyPlayed && recentlyPlayed.length > 0 && (
            <PopularTracksSection
              title={t("home.jumpBackIn")}
              icon={<TimeFill className="w-5 h-5 text-sky-400" />}
              items={recentlyPlayed}
              headingMarginTop="mt-[26px]"
            />
          )}

          {hasDiscoveryContent && (
            <div className="mt-8 flex items-center gap-3 px-8">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">{t("home.discover")}</span>
              <span className="h-px flex-1 bg-border-primary" />
            </div>
          )}

          {/* Listening Right Now (Trending Chart) */}
          {popularTracksOnly && popularTracksOnly.length > 0 && (
            <PopularTracksSection
              title={t("home.whatEveryonesOn")}
              icon={<FireFill className="w-5 h-5 text-amber-500" />}
              items={popularTracksOnly}
              headingMarginTop="mt-[18px]"
            />
          )}

          {/* Artists */}
          {popularArtists.length > 0 && (
            <PopularTracksSection
              title={t("home.popularArtists")}
              icon={<FlashCircleFill className="w-5 h-5 text-violet-400" />}
              items={popularArtists}
              headingMarginTop="mt-[26px]"
            />
          )}

          {/* Most Listened of All Time */}
          {popularTracksAllTime && popularTracksAllTime.length > 0 && (
            <PopularTracksSection
              title={t("home.mostListened")}
              icon={<TrophyFill className="w-5 h-5 text-yellow-500" />}
              items={popularTracksAllTime}
              headingMarginTop="mt-[26px]"
            />
          )}

          {/* Top Albums */}
          {popularAlbums && popularAlbums.length > 0 && (
            <PopularTracksSection
              title={t("home.popularAlbums")}
              icon={<AlbumFill className="w-5 h-5 text-emerald-400" />}
              items={popularAlbums}
              headingMarginTop="mt-[26px]"
            />
          )}

          {/* Popular Playlists */}
          {popularPlaylists && popularPlaylists.length > 0 && (
            <PopularTracksSection
              title={t("home.popularPlaylists")}
              icon={<PlaylistFill className="w-5 h-5 text-rose-400" />}
              items={popularPlaylists}
              headingMarginTop="mt-[26px]"
            />
          )}
      </div>
    </div>
  );
}

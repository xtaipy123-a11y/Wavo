import { HashRouter } from "react-router-dom";
import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { ToastProvider, AppleEmojiProvider, RootErrorBoundary, GlobalTooltip, WindowAnimationContainer } from "@/shared/ui";
import { useWindowDrag } from "@/shared/hooks";
import { useAppIconSync } from "@/features/player";
import { I18nProvider } from "@/languages";
import { AuthLock } from "@/features/auth";
import { CoverSwRegistrar } from "@/features/covers";
import { usePresenceSync } from "@/shared/presence";
import { useThemeCustomizationSync } from "@/features/settings";
import { useTouchBarSync } from "@/features/touchbar";
import { useExtensionsSync } from "@/features/extensions";
import { UpdateToastBridge } from "@/features/updater";
import { OverlayPlayer, useOverlaySync } from "@/features/overlay";
import { AppRoutes } from "./routes";
import DeeplinkHandler from "./DeeplinkHandler";
import EnvironmentWarning from "./EnvironmentWarning";
import { ConnectivityWall } from "@/features/connectivity";
import { getAuthSession } from "@/shared/api";
import "./globals.css";
import { useDownloadStore } from "@/features/downloads/downloadStore";
import { useAuthStore } from "@/features/auth/store/authStore";
import { CloudSync, restoreLocalProfile, setActiveCloudSync } from "@/features/cloud/cloudSync";
import { WavoConnect, setActiveConnect } from "@/features/cloud/wavoConnect";
import { publishFriendActivity } from "@/features/cloud/friendActivity";
import { usePlayerStore } from "@/features/player/store/playerStore";

function AppIconSync() {
  useAppIconSync();
  return null;
}

function PresenceSync() {
  usePresenceSync();
  return null;
}

function ThemeSync() {
  useThemeCustomizationSync();
  useExtensionsSync();
  return null;
}

function TouchBarSync() {
  useTouchBarSync();
  return null;
}

function OverlaySync() {
  useOverlaySync();
  return null;
}

function OfflineDownloadsSync() {
  useEffect(() => { void useDownloadStore.getState().hydrate(); }, []);
  return null;
}

function CloudSyncBridge() {
  const userId = useAuthStore((state) => state.user?.id);
  useEffect(() => {
    if (!userId) return;
    const priorOwner = localStorage.getItem("wavo_player_owner");
    if (priorOwner && priorOwner !== userId) {
      usePlayerStore.getState().dispatch({ type: "PAUSE_REQUESTED" });
      restoreLocalProfile(userId);
      usePlayerStore.setState({ queue: [], currentIndex: -1, currentTrack: null, positionMs: 0,
        playbackContext: null, playbackContextCover: null, status: "idle" });
    }
    localStorage.setItem("wavo_player_owner", userId);
    const sync = new CloudSync(userId);
    const connect = new WavoConnect(userId);
    let publishTimer: ReturnType<typeof setTimeout> | null = null;
    const publish = () => {
      if (publishTimer) clearTimeout(publishTimer);
      publishTimer = setTimeout(() => { void publishFriendActivity(userId).catch(() => {}); }, 1000);
    };
    let lastActivity = "";
    const unsubscribePlayer = usePlayerStore.subscribe((state) => {
      const next = `${state.status}:${state.currentTrack?.id ?? ""}`;
      if (next !== lastActivity) { lastActivity = next; publish(); }
    });
    window.addEventListener("wavo:privacy-changed", publish);
    const activityHeartbeat = window.setInterval(publish, 45000);
    setActiveConnect(connect);
    setActiveCloudSync(sync);
    sync.start();
    connect.start();
    publish();
    return () => { if (publishTimer) clearTimeout(publishTimer); unsubscribePlayer();
      window.clearInterval(activityHeartbeat);
      window.removeEventListener("wavo:privacy-changed", publish);
      sync.stop(); connect.stop(); setActiveConnect(null); setActiveCloudSync(null); };
  }, [userId]);
  return null;
}

export default function App() {
  const isOverlay = window.location.hash.startsWith("#/overlay");

  if (isOverlay) {
    if (!getAuthSession()) {
      window.wavoElectron?.closeOverlay?.();
      return null;
    }

    return (
      <ThemeProvider
        attribute="data-theme"
        defaultTheme="dark"
        enableSystem={false}
        forcedTheme="dark"
      >
        <GlobalTooltip />
        <ThemeSync />
        <OverlayPlayer />
      </ThemeProvider>
    );
  }

  useWindowDrag();

  return (
    <HashRouter>
      <CoverSwRegistrar />
      <ThemeProvider
        attribute="data-theme"
        defaultTheme="system"
        enableSystem={true}
        disableTransitionOnChange
      >
        <GlobalTooltip />
        <ThemeSync />
        <AppIconSync />
        <PresenceSync />
        <TouchBarSync />
        <OverlaySync />
        <OfflineDownloadsSync />
        {!isOverlay && <CloudSyncBridge />}
        <AppleEmojiProvider>
          <I18nProvider>
            <ToastProvider>
              <UpdateToastBridge />
              <RootErrorBoundary>
                <WindowAnimationContainer>
                  <DeeplinkHandler />
                  <EnvironmentWarning />
                  <ConnectivityWall />
                  <AuthLock>
                    <AppRoutes />
                  </AuthLock>
                </WindowAnimationContainer>
              </RootErrorBoundary>
            </ToastProvider>
          </I18nProvider>
        </AppleEmojiProvider>
      </ThemeProvider>
    </HashRouter>
  );
}

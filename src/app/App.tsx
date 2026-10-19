import { HashRouter } from "react-router-dom";
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

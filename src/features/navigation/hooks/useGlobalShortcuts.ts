import { useEffect, useRef } from "react";
import { playerEngine, usePlayerStore, toVolumeGain, toVolumeLevel } from "@/features/player";
import { useShortcutsStore, matchesShortcut, getShortcutActivationScope, type MainAppShortcutsSettings } from "@/features/shortcuts";
import { useNativeShortcutSync } from "@/features/shortcuts/hooks/useNativeShortcutSync";
import { isBlockingOverlayOpen, isKeyHandledByFocusedControl, isTypingTarget } from "../utils/shortcutGuards";

const VOLUME_STEP = 0.05;
const SEEK_STEP_MS = 5_000;
const DEFAULT_UNMUTE_LEVEL = 0.7;
const REPEATABLE_CODES = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export type RightPanelTab = "queue" | "lyrics";
export interface GlobalShortcutsOptions {
  enabled?: boolean;
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  rightPanelOpen: boolean;
  rightPanelTab: RightPanelTab;
  openRightPanel: (tab: RightPanelTab) => void;
  closeRightPanel: () => void;
  fullscreenOpen: boolean;
  openFullscreen: () => void;
  closeFullscreen: () => void;
  onEscapeFallback?: () => boolean;
}

export function useGlobalShortcuts(options: GlobalShortcutsOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const lastUnmutedLevelRef = useRef(DEFAULT_UNMUTE_LEVEL);
  useNativeShortcutSync();

  useEffect(() => {
    const runAction = (action: keyof MainAppShortcutsSettings) => {
      const opts = optionsRef.current;
      const state = usePlayerStore.getState();
      switch (action) {
        case "playPause": void playerEngine.togglePlayPause(); break;
        case "nextTrack": void playerEngine.skipNext(); break;
        case "prevTrack": void playerEngine.skipPrevious(); break;
        case "toggleFullscreen":
          if (opts.fullscreenOpen) opts.closeFullscreen();
          else if (state.currentTrack !== null && state.status !== "idle") opts.openFullscreen();
          break;
        case "toggleQueue":
        case "toggleLyrics": {
          const tab = action === "toggleQueue" ? "queue" : "lyrics";
          if (opts.rightPanelOpen && opts.rightPanelTab === tab) opts.closeRightPanel();
          else opts.openRightPanel(tab);
          break;
        }
        case "search": opts.openSearch(); break;
        case "toggleMute": {
          const level = toVolumeLevel(state.volume);
          if (level > 0) {
            lastUnmutedLevelRef.current = level;
            playerEngine.setVolume(0);
          } else playerEngine.setVolume(toVolumeGain(lastUnmutedLevelRef.current || DEFAULT_UNMUTE_LEVEL));
          break;
        }
        case "seekBackward": playerEngine.seek(Math.max(0, state.positionMs - SEEK_STEP_MS)); break;
        case "seekForward":
          playerEngine.seek(Math.min(state.durationMs > 0 ? state.durationMs : state.positionMs + SEEK_STEP_MS, state.positionMs + SEEK_STEP_MS));
          break;
        case "volumeUp":
        case "volumeDown": {
          const level = toVolumeLevel(state.volume);
          const delta = action === "volumeUp" ? VOLUME_STEP : -VOLUME_STEP;
          const next = Math.round(Math.min(1, Math.max(0, level + delta)) * 100) / 100;
          playerEngine.setVolume(toVolumeGain(next));
          if (next > 0) lastUnmutedLevelRef.current = next;
          break;
        }
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const opts = optionsRef.current;
      const settings = useShortcutsStore.getState();
      if (opts.enabled === false || event.defaultPrevented || settings.isRecording) return;
      if (typeof document.hasFocus === "function" && process.env.NODE_ENV !== "test" && !document.hasFocus()) return;
      const { code } = event;
      if (event.repeat && !REPEATABLE_CODES.has(code)) return;
      if (code === "Escape" || event.key === "Escape") {
        if (isBlockingOverlayOpen()) return;
        if (opts.searchOpen) { event.preventDefault(); event.stopPropagation(); opts.closeSearch(); }
        else if (opts.rightPanelOpen) { event.preventDefault(); event.stopPropagation(); opts.closeRightPanel(); }
        else if (opts.fullscreenOpen) { event.preventDefault(); event.stopPropagation(); opts.closeFullscreen(); }
        else if (opts.onEscapeFallback?.()) { event.preventDefault(); event.stopPropagation(); }
        return;
      }
      if (isTypingTarget(event.target) || isBlockingOverlayOpen() || isKeyHandledByFocusedControl(event.target, code)) return;
      for (const action of ["toggleOverlay", "quickLikeSong"] as const) {
        if (getShortcutActivationScope(settings, "global", action) === "app" && matchesShortcut(event, settings.global[action])) {
          event.preventDefault();
          if (action === "toggleOverlay") void window.wavoElectron?.toggleOverlay?.();
          else window.wavoElectron?.sendOverlayAction?.({ type: "like" });
          return;
        }
      }
      for (const action of Object.keys(settings.mainApp) as (keyof MainAppShortcutsSettings)[]) {
        if (!matchesShortcut(event, settings.mainApp[action])) continue;
        event.preventDefault();
        // Native callbacks already deliver registered system-wide shortcuts.
        if (!settings.nativeRegistration.registered.includes(`mainApp-${action}`)) runAction(action);
        return;
      }
    };

    const unsubscribeNative = window.wavoElectron?.onNativeShortcut?.((id) => {
      const settings = useShortcutsStore.getState();
      if (optionsRef.current.enabled === false || settings.isRecording) return;
      if (id.startsWith("mainApp-")) {
        const action = id.slice("mainApp-".length) as keyof MainAppShortcutsSettings;
        if (action in settings.mainApp && getShortcutActivationScope(settings, "mainApp", action) === "global") runAction(action);
      } else if (id.startsWith("miniplayer-")) {
        const action = id.slice("miniplayer-".length);
        if (getShortcutActivationScope(settings, "miniplayer", action) !== "global") return;
        if (action === "likeTrack") window.wavoElectron?.sendOverlayAction?.({ type: "like" });
        else if (action in settings.mainApp) runAction(action as keyof MainAppShortcutsSettings);
      }
    });
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      unsubscribeNative?.();
    };
  }, []);
}

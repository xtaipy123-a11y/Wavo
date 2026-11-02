import { describe, it, expect, beforeEach, vi } from "vitest";
import { useShortcutsStore } from "./shortcutsStore";
import { DEFAULT_SHORTCUTS, getShortcutActivationScope } from "../types";
import { useOverlaySettingsStore } from "@/features/overlay/store/overlaySettingsStore";

describe("shortcutsStore", () => {
  beforeEach(() => {
    useShortcutsStore.getState().resetAll();
  });

  it("initializes with default shortcuts across all sections", () => {
    const state = useShortcutsStore.getState();
    expect(state.global.toggleOverlay).toBe(DEFAULT_SHORTCUTS.global.toggleOverlay);
    expect(state.global.quickLikeSong).toBe(DEFAULT_SHORTCUTS.global.quickLikeSong);
    expect(state.mainApp.playPause).toBe("Space");
    expect(state.mainApp.nextTrack).toBe("Control+Right");
    expect(state.miniplayer.playPause).toBe("Space");
    expect(state.miniplayer.likeTrack).toBe("L");
  });

  it("updates global shortcuts and normalizes them", () => {
    const updateOverlaySettings = vi.fn();
    (window as any).wavoElectron = { updateOverlaySettings };

    useShortcutsStore.getState().setGlobalShortcut("quickLikeSong", "Ctrl+Alt+L");
    expect(useShortcutsStore.getState().global.quickLikeSong).toBe("Control+Alt+L");
    expect(updateOverlaySettings).toHaveBeenCalledWith(
      expect.objectContaining({ likeShortcut: "Control+Alt+L" })
    );

    useShortcutsStore.getState().setGlobalShortcut("toggleOverlay", "Alt+Shift+Щ");
    expect(useShortcutsStore.getState().global.toggleOverlay).toBe("Alt+Shift+O");
    expect(useOverlaySettingsStore.getState().shortcut).toBe("Alt+Shift+O");
  });

  it("updates main app and miniplayer shortcuts", () => {
    useShortcutsStore.getState().setMainAppShortcut("playPause", "P");
    expect(useShortcutsStore.getState().mainApp.playPause).toBe("P");

    useShortcutsStore.getState().setMiniplayerShortcut("nextTrack", "N");
    expect(useShortcutsStore.getState().miniplayer.nextTrack).toBe("N");
  });

  it("resets individual shortcuts to default", () => {
    useShortcutsStore.getState().setMainAppShortcut("playPause", "P");
    expect(useShortcutsStore.getState().mainApp.playPause).toBe("P");

    useShortcutsStore.getState().resetShortcut("mainApp", "playPause");
    expect(useShortcutsStore.getState().mainApp.playPause).toBe("Space");
  });

  it("resets an entire section to default", () => {
    useShortcutsStore.getState().setMiniplayerShortcut("nextTrack", "N");
    useShortcutsStore.getState().setMiniplayerShortcut("likeTrack", "H");

    useShortcutsStore.getState().resetSection("miniplayer");
    expect(useShortcutsStore.getState().miniplayer.nextTrack).toBe("]");
    expect(useShortcutsStore.getState().miniplayer.likeTrack).toBe("L");
  });

  it("resets all shortcuts to defaults", () => {
    useShortcutsStore.getState().setGlobalShortcut("quickLikeSong", "Alt+Shift+K");
    useShortcutsStore.getState().setMainAppShortcut("toggleMute", "X");
    useShortcutsStore.getState().setMiniplayerShortcut("likeTrack", "Y");

    useShortcutsStore.getState().resetAll();
    expect(useShortcutsStore.getState().global.quickLikeSong).toBe("Alt+Shift+L");
    expect(useShortcutsStore.getState().mainApp.toggleMute).toBe("M");
    expect(useShortcutsStore.getState().miniplayer.likeTrack).toBe("L");
  });

  it("toggles isRecording and notifies Electron to pause global shortcuts", () => {
    const pauseOverlayShortcuts = vi.fn();
    (window as any).wavoElectron = { pauseOverlayShortcuts };

    useShortcutsStore.getState().setIsRecording(true);
    expect(useShortcutsStore.getState().isRecording).toBe(true);
    expect(pauseOverlayShortcuts).toHaveBeenCalledWith(true);

    useShortcutsStore.getState().setIsRecording(false);
    expect(useShortcutsStore.getState().isRecording).toBe(false);
    expect(pauseOverlayShortcuts).toHaveBeenCalledWith(false);
  });

  it("persists activation scopes without persisting native registration status", () => {
    useShortcutsStore.getState().setActivationScope("mainApp", "playPause", "global");
    useShortcutsStore.getState().setNativeRegistration({ registered: ["mainApp-playPause"], failed: {} });
    const saved = JSON.parse(localStorage.getItem("wavo_shortcuts_settings_v1")!).state;
    expect(saved.activationScopes).toEqual({ "mainApp-playPause": "global" });
    expect(saved.nativeRegistration).toBeUndefined();
  });

  it("can restrict a previously global overlay action to Wavo", () => {
    const updateOverlaySettings = vi.fn();
    (window as any).wavoElectron = { updateOverlaySettings };
    useShortcutsStore.getState().setActivationScope("global", "toggleOverlay", "app");
    expect(updateOverlaySettings).toHaveBeenLastCalledWith(expect.objectContaining({ shortcutGlobal: false, likeShortcutGlobal: true }));
  });

  it("restores scope defaults when resetting an action or section", () => {
    const store = useShortcutsStore.getState();
    store.setActivationScope("global", "toggleOverlay", "app");
    store.setActivationScope("mainApp", "nextTrack", "global");
    store.resetShortcut("global", "toggleOverlay");
    expect(getShortcutActivationScope(useShortcutsStore.getState(), "global", "toggleOverlay")).toBe("global");
    store.resetSection("mainApp");
    expect(getShortcutActivationScope(useShortcutsStore.getState(), "mainApp", "nextTrack")).toBe("app");
  });

  it("retains the previous behavior for settings saved before scopes existed", async () => {
    localStorage.setItem("wavo_shortcuts_settings_v1", JSON.stringify({ state: DEFAULT_SHORTCUTS, version: 0 }));
    await useShortcutsStore.persist.rehydrate();
    expect(getShortcutActivationScope(useShortcutsStore.getState(), "mainApp", "playPause")).toBe("app");
    expect(getShortcutActivationScope(useShortcutsStore.getState(), "global", "quickLikeSong")).toBe("global");
  });
});

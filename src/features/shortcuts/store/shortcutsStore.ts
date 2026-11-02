import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DEFAULT_SHORTCUTS,
  type ShortcutsSettings,
  type GlobalShortcutsSettings,
  type MainAppShortcutsSettings,
  type MiniplayerShortcutsSettings,
  type ShortcutScope,
  type ShortcutActivationScope,
  type ShortcutRegistrationResult,
  getShortcutActivationScope,
} from "../types";
import { normalizeShortcutToEnglish } from "../utils/shortcutMatching";
import { useOverlaySettingsStore } from "@/features/overlay/store/overlaySettingsStore";

interface ShortcutsStoreState extends ShortcutsSettings {
  activationScopes: Record<string, ShortcutActivationScope>;
  nativeRegistration: ShortcutRegistrationResult;
  setActivationScope: (scope: ShortcutScope, action: string, value: ShortcutActivationScope) => void;
  setNativeRegistration: (result: ShortcutRegistrationResult) => void;
  isRecording: boolean;
  setIsRecording: (recording: boolean) => void;
  setGlobalShortcut: (action: keyof GlobalShortcutsSettings, rawShortcut: string) => void;
  setMainAppShortcut: (action: keyof MainAppShortcutsSettings, rawShortcut: string) => void;
  setMiniplayerShortcut: (action: keyof MiniplayerShortcutsSettings, rawShortcut: string) => void;
  resetShortcut: (scope: ShortcutScope, action: string) => void;
  resetSection: (scope: ShortcutScope) => void;
  resetAll: () => void;
}

function notifyElectronGlobalShortcuts(global: GlobalShortcutsSettings, activationScopes: Record<string, ShortcutActivationScope> = {}) {
  if (typeof window !== "undefined" && window.wavoElectron?.updateOverlaySettings) {
    window.wavoElectron.updateOverlaySettings({
      shortcut: global.toggleOverlay,
      likeShortcut: global.quickLikeSong,
      shortcutGlobal: getShortcutActivationScope({ activationScopes }, "global", "toggleOverlay") === "global",
      likeShortcutGlobal: getShortcutActivationScope({ activationScopes }, "global", "quickLikeSong") === "global",
    });
  }
}

export const useShortcutsStore = create<ShortcutsStoreState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SHORTCUTS,
      activationScopes: {},
      nativeRegistration: { registered: [], failed: {} },
      setNativeRegistration: (nativeRegistration) => set({ nativeRegistration }),
      setActivationScope: (scope, action, value) => {
        if (!(action in DEFAULT_SHORTCUTS[scope]) || (value !== "app" && value !== "global")) return;
        const activationScopes = { ...get().activationScopes, [`${scope}-${action}`]: value };
        set({ activationScopes });
        notifyElectronGlobalShortcuts(get().global, activationScopes);
      },
      isRecording: false,

      setIsRecording: (recording: boolean) => {
        set({ isRecording: recording });
        if (typeof window !== "undefined" && window.wavoElectron?.pauseOverlayShortcuts) {
          window.wavoElectron.pauseOverlayShortcuts(recording);
        }
      },

      setGlobalShortcut: (action, rawShortcut) => {
        const normalized =
          normalizeShortcutToEnglish(rawShortcut) || DEFAULT_SHORTCUTS.global[action];
        const nextGlobal = {
          ...get().global,
          [action]: normalized,
        };
        set({ global: nextGlobal });
        notifyElectronGlobalShortcuts(nextGlobal, get().activationScopes);

        // Keep legacy overlay store in sync for toggleOverlay
        if (action === "toggleOverlay") {
          useOverlaySettingsStore.setState({ shortcut: normalized });
        }
      },

      setMainAppShortcut: (action, rawShortcut) => {
        const normalized =
          normalizeShortcutToEnglish(rawShortcut) || DEFAULT_SHORTCUTS.mainApp[action];
        set({
          mainApp: {
            ...get().mainApp,
            [action]: normalized,
          },
        });
      },

      setMiniplayerShortcut: (action, rawShortcut) => {
        const normalized =
          normalizeShortcutToEnglish(rawShortcut) || DEFAULT_SHORTCUTS.miniplayer[action];
        set({
          miniplayer: {
            ...get().miniplayer,
            [action]: normalized,
          },
        });
      },

      resetShortcut: (scope, action) => {
        const { [`${scope}-${action}`]: _removed, ...activationScopes } = get().activationScopes;
        set({ activationScopes });
        if (scope === "global" && action in DEFAULT_SHORTCUTS.global) {
          const act = action as keyof GlobalShortcutsSettings;
          get().setGlobalShortcut(act, DEFAULT_SHORTCUTS.global[act]);
        } else if (scope === "mainApp" && action in DEFAULT_SHORTCUTS.mainApp) {
          const act = action as keyof MainAppShortcutsSettings;
          get().setMainAppShortcut(act, DEFAULT_SHORTCUTS.mainApp[act]);
        } else if (scope === "miniplayer" && action in DEFAULT_SHORTCUTS.miniplayer) {
          const act = action as keyof MiniplayerShortcutsSettings;
          get().setMiniplayerShortcut(act, DEFAULT_SHORTCUTS.miniplayer[act]);
        }
      },

      resetSection: (scope) => {
        set({ activationScopes: Object.fromEntries(Object.entries(get().activationScopes).filter(([id]) => !id.startsWith(`${scope}-`))) });
        if (scope === "global") {
          const next = { ...DEFAULT_SHORTCUTS.global };
          set({ global: next });
          notifyElectronGlobalShortcuts(next, get().activationScopes);
          useOverlaySettingsStore.setState({ shortcut: next.toggleOverlay });
        } else if (scope === "mainApp") {
          set({ mainApp: { ...DEFAULT_SHORTCUTS.mainApp } });
        } else if (scope === "miniplayer") {
          set({ miniplayer: { ...DEFAULT_SHORTCUTS.miniplayer } });
        }
      },

      resetAll: () => {
        set({
          activationScopes: {},
          nativeRegistration: { registered: [], failed: {} },
          global: { ...DEFAULT_SHORTCUTS.global },
          mainApp: { ...DEFAULT_SHORTCUTS.mainApp },
          miniplayer: { ...DEFAULT_SHORTCUTS.miniplayer },
        });
        notifyElectronGlobalShortcuts(DEFAULT_SHORTCUTS.global);
        useOverlaySettingsStore.setState({ shortcut: DEFAULT_SHORTCUTS.global.toggleOverlay });
      },
    }),
    {
      name: "wavo_shortcuts_settings_v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activationScopes: state.activationScopes,
        global: state.global,
        mainApp: state.mainApp,
        miniplayer: state.miniplayer,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const validIds = new Set(Object.entries(DEFAULT_SHORTCUTS).flatMap(([scope, actions]) => Object.keys(actions).map((action) => `${scope}-${action}`)));
        state.activationScopes = Object.fromEntries(Object.entries(state.activationScopes ?? {}).filter(([id, value]) => validIds.has(id) && (value === "app" || value === "global")));

        // Ensure newly added actions have defaults
        state.global = {
          ...DEFAULT_SHORTCUTS.global,
          ...(state.global || {}),
        };
        state.mainApp = {
          ...DEFAULT_SHORTCUTS.mainApp,
          ...(state.mainApp || {}),
        };
        state.miniplayer = {
          ...DEFAULT_SHORTCUTS.miniplayer,
          ...(state.miniplayer || {}),
        };

        // Normalize all rehydrated shortcuts
        for (const key of Object.keys(state.global) as (keyof GlobalShortcutsSettings)[]) {
          state.global[key] =
            normalizeShortcutToEnglish(state.global[key]) || DEFAULT_SHORTCUTS.global[key];
        }
        for (const key of Object.keys(state.mainApp) as (keyof MainAppShortcutsSettings)[]) {
          state.mainApp[key] =
            normalizeShortcutToEnglish(state.mainApp[key]) || DEFAULT_SHORTCUTS.mainApp[key];
        }
        for (const key of Object.keys(state.miniplayer) as (keyof MiniplayerShortcutsSettings)[]) {
          state.miniplayer[key] =
            normalizeShortcutToEnglish(state.miniplayer[key]) || DEFAULT_SHORTCUTS.miniplayer[key];
        }

        notifyElectronGlobalShortcuts(state.global, state.activationScopes);
      },
    }
  )
);

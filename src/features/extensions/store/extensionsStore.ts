import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemeColors = {
  background: string;
  surface: string;
  elevated: string;
  text: string;
  accent: string;
};

export type ThemePack = {
  id: string;
  name: string;
  light: ThemeColors;
  dark: ThemeColors;
};

// The palettes mirror Swiftify's selectable color families while keeping Wavo's UI structure.
export const builtInThemes: ThemePack[] = [
  { id: "wavo", name: "Wavo", light: { background: "#f5f5f7", surface: "#ffffff", elevated: "#e6e6eb", text: "#18181b", accent: "#ff3b3b" }, dark: { background: "#0a0a0a", surface: "#0a0a0a", elevated: "#141414", text: "#ffffff", accent: "#ff4d4d" } },
  { id: "catppuccin", name: "Catppuccin", light: { background: "#eff1f5", surface: "#ffffff", elevated: "#e6e9ef", text: "#4c4f69", accent: "#8839ef" }, dark: { background: "#1e1e2e", surface: "#181825", elevated: "#313244", text: "#cdd6f4", accent: "#cba6f7" } },
  { id: "nord", name: "Nord", light: { background: "#eceff4", surface: "#ffffff", elevated: "#e5e9f0", text: "#2e3440", accent: "#5e81ac" }, dark: { background: "#2e3440", surface: "#2e3440", elevated: "#3b4252", text: "#eceff4", accent: "#88c0d0" } },
  { id: "tokyo-night", name: "Tokyo Night", light: { background: "#e1e2e7", surface: "#e9e9ed", elevated: "#d0d5e3", text: "#2f51a2", accent: "#2e7de9" }, dark: { background: "#1a1b26", surface: "#16161e", elevated: "#292e42", text: "#c0caf5", accent: "#7aa2f7" } },
  { id: "gruvbox", name: "Gruvbox", light: { background: "#fbf1c7", surface: "#f9f5d7", elevated: "#f2e5bc", text: "#3c3836", accent: "#af3a03" }, dark: { background: "#282828", surface: "#1d2021", elevated: "#3c3836", text: "#ebdbb2", accent: "#fe8019" } },
  { id: "rose-pine", name: "Rosé Pine", light: { background: "#fffaf3", surface: "#fffaf3", elevated: "#f2e9e1", text: "#575279", accent: "#907aa9" }, dark: { background: "#1f1d2e", surface: "#191724", elevated: "#26233a", text: "#e0def4", accent: "#c4a7e7" } },
];

const hexColor = /^#[0-9a-fA-F]{6}$/;
const packId = /^[a-z0-9][a-z0-9-]{0,31}$/;

function isColors(value: unknown): value is ThemeColors {
  if (!value || typeof value !== "object") return false;
  const colors = value as Record<string, unknown>;
  return ["background", "surface", "elevated", "text", "accent"].every(
    (key) => typeof colors[key] === "string" && hexColor.test(colors[key]),
  );
}

export function parseThemePack(value: unknown): ThemePack {
  if (!value || typeof value !== "object") throw new Error("Invalid theme file");
  const pack = value as Record<string, unknown>;
  if (pack.wavoThemeVersion !== 1 || typeof pack.id !== "string" || !packId.test(pack.id) ||
      typeof pack.name !== "string" || pack.name.trim().length < 1 || pack.name.length > 40 ||
      !isColors(pack.light) || !isColors(pack.dark) ||
      builtInThemes.some((theme) => theme.id === pack.id)) {
    throw new Error("Invalid Wavo theme file");
  }
  return { id: pack.id, name: pack.name.trim(), light: pack.light, dark: pack.dark };
}

type ExtensionsState = {
  selectedTheme: string;
  installedThemes: ThemePack[];
  compactRows: boolean;
  roundCovers: boolean;
  ambientGlow: boolean;
  setSelectedTheme: (id: string) => void;
  setCompactRows: (enabled: boolean) => void;
  setRoundCovers: (enabled: boolean) => void;
  setAmbientGlow: (enabled: boolean) => void;
  installTheme: (value: unknown) => void;
  removeTheme: (id: string) => void;
};

export const useExtensionsStore = create<ExtensionsState>()(
  persist(
    (set, get) => ({
      selectedTheme: "wavo",
      installedThemes: [],
      compactRows: false,
      roundCovers: false,
      ambientGlow: false,
      setSelectedTheme: (id) => {
        if ([...builtInThemes, ...get().installedThemes].some((theme) => theme.id === id)) set({ selectedTheme: id });
      },
      setCompactRows: (compactRows) => set({ compactRows }),
      setRoundCovers: (roundCovers) => set({ roundCovers }),
      setAmbientGlow: (ambientGlow) => set({ ambientGlow }),
      installTheme: (value) => {
        const pack = parseThemePack(value);
        set((state) => ({
          installedThemes: [...state.installedThemes.filter((theme) => theme.id !== pack.id), pack],
          selectedTheme: pack.id,
        }));
      },
      removeTheme: (id) => set((state) => ({
        installedThemes: state.installedThemes.filter((theme) => theme.id !== id),
        selectedTheme: state.selectedTheme === id ? "wavo" : state.selectedTheme,
      })),
    }),
    {
      name: "wavo_extensions_v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedTheme: state.selectedTheme,
        installedThemes: state.installedThemes,
        compactRows: state.compactRows,
        roundCovers: state.roundCovers,
        ambientGlow: state.ambientGlow,
      }),
    },
  ),
);

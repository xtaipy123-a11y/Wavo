import { useEffect } from "react";
import { useTheme } from "next-themes";
import { builtInThemes, useExtensionsStore } from "../store/extensionsStore";

const themeProperties = [
  "--bg-canvas", "--bg-surface", "--bg-primary", "--bg-elevated", "--bg-panel", "--bg-overlay",
  "--text-primary", "--text-secondary", "--text-tertiary", "--accent-primary", "--accent-secondary",
  "--accent-tertiary", "--btn-primary-bg", "--btn-primary-text",
];

function rgb(hex: string): string {
  return `${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}`;
}

export function useExtensionsSync(): void {
  const { resolvedTheme } = useTheme();
  const selectedTheme = useExtensionsStore((state) => state.selectedTheme);
  const installedThemes = useExtensionsStore((state) => state.installedThemes);
  const compactRows = useExtensionsStore((state) => state.compactRows);
  const roundCovers = useExtensionsStore((state) => state.roundCovers);
  const ambientGlow = useExtensionsStore((state) => state.ambientGlow);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.wavoCompact = String(compactRows);
    root.dataset.wavoRoundCovers = String(roundCovers);
    root.dataset.wavoAmbient = String(ambientGlow);
    return () => {
      delete root.dataset.wavoCompact;
      delete root.dataset.wavoRoundCovers;
      delete root.dataset.wavoAmbient;
    };
  }, [compactRows, roundCovers, ambientGlow]);

  useEffect(() => {
    const style = document.documentElement.style;
    themeProperties.forEach((property) => style.removeProperty(property));
    const pack = [...builtInThemes, ...installedThemes].find((theme) => theme.id === selectedTheme);
    if (!pack || pack.id === "wavo") return;
    const dark = resolvedTheme === "dark";
    const colors = dark ? pack.dark : pack.light;
    const ink = dark ? "255, 255, 255" : "0, 0, 0";
    const values: Record<string, string> = {
      "--bg-canvas": colors.surface,
      "--bg-surface": colors.surface,
      "--bg-primary": colors.background,
      "--bg-elevated": colors.elevated,
      "--bg-panel": colors.elevated,
      "--bg-overlay": `rgba(${rgb(colors.background)}, 0.96)`,
      "--text-primary": colors.text,
      "--text-secondary": `rgba(${ink}, 0.7)`,
      "--text-tertiary": `rgba(${ink}, 0.48)`,
      "--accent-primary": colors.accent,
      "--accent-secondary": colors.accent,
      "--accent-tertiary": colors.accent,
      "--btn-primary-bg": colors.accent,
      "--btn-primary-text": dark ? "#111111" : "#ffffff",
    };
    Object.entries(values).forEach(([property, value]) => style.setProperty(property, value));
    return () => themeProperties.forEach((property) => style.removeProperty(property));
  }, [selectedTheme, installedThemes, resolvedTheme]);
}

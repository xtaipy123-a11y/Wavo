import { useEffect } from "react";
import { useTheme } from "next-themes";
import {
  useCustomizationStore,
  selectIsGlassThemeActive,
} from "../store/customizationStore";

// keeps light theme disabled and forces dark mode when wallpaper glass is active
export function useThemeCustomizationSync() {
  const { resolvedTheme } = useTheme();
  const isGlassActive = useCustomizationStore(selectIsGlassThemeActive);
  const setBlockConfig = useCustomizationStore((state) => state.setBlockConfig);

  useEffect(() => {
    // Preserve the selected appearance. Opaque blocks keep wallpaper contrast in light mode.
    if (isGlassActive && resolvedTheme === "light") {
      setBlockConfig("sidebar", { opacity: 100, blur: 0, dim: 0 });
      setBlockConfig("contentView", { opacity: 100, blur: 0, dim: 0 });
      setBlockConfig("miniplayer", { opacity: 100, blur: 0, dim: 0 });
    }
  }, [isGlassActive, resolvedTheme, setBlockConfig]);

  return { isGlassActive };
}

import { useEffect } from "react";
import { usePlayerStore, type AccentVariant } from "../store/playerStore";
import defaultIcon from "@/assets/app-icon.png";
import spotifyIcon from "@/assets/branding/app-icon-spotify.png";
import discordIcon from "@/assets/branding/app-icon-discord.png";
import telegramIcon from "@/assets/branding/app-icon-telegram.png";
import auroraIcon from "@/assets/branding/app-icon-aurora.png";
import sunsetIcon from "@/assets/branding/app-icon-sunset.png";
import oceanIcon from "@/assets/branding/app-icon-ocean.png";
import forestIcon from "@/assets/branding/app-icon-forest.png";
import berryIcon from "@/assets/branding/app-icon-berry.png";
import carbonIcon from "@/assets/branding/app-icon-carbon.png";
import pixelIcon from "@/assets/branding/app-icon-pixel.png";
import scanlinesIcon from "@/assets/branding/app-icon-scanlines.png";
import vhsIcon from "@/assets/branding/app-icon-vhs.png";

const brandingIcons: Record<AccentVariant, string> = {
  default: defaultIcon,
  spotify: spotifyIcon,
  discord: discordIcon,
  telegram: telegramIcon,
  aurora: auroraIcon,
  sunset: sunsetIcon,
  ocean: oceanIcon,
  forest: forestIcon,
  berry: berryIcon,
  carbon: carbonIcon,
  pixel: pixelIcon,
  scanlines: scanlinesIcon,
  vhs: vhsIcon,
};

async function renderIconDataUrl(logoSrc: string): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load branding app icon"));
    img.src = logoSrc;
  });

  ctx.drawImage(img, 0, 0, 256, 256);
  return canvas.toDataURL("image/png");
}

// Encoding the same icon again on every click costs ~20ms; keep the results so
// switching back to a previously used variant is immediate.
const iconDataUrls = new Map<string, Promise<string>>();

function getIconDataUrl(logoSrc: string): Promise<string> {
  let cached = iconDataUrls.get(logoSrc);
  if (!cached) {
    cached = renderIconDataUrl(logoSrc).catch(() => "");
    iconDataUrls.set(logoSrc, cached);
  }
  return cached;
}

function scheduleIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout: 1000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, 120);
  return () => window.clearTimeout(id);
}

export function useAppIconSync() {
  const accentVariant = usePlayerStore((state) => state.accentVariant);

  useEffect(() => {
    const logoSrc = brandingIcons[accentVariant] || defaultIcon;
    let active = true;

    void getIconDataUrl(logoSrc).then((dataUrl) => {
      if (!active || !dataUrl) return;

      if (window.wavoElectron?.setAppIcon) {
        window.wavoElectron.setAppIcon(dataUrl);
      }

      let favicon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!favicon) {
        favicon = document.createElement("link");
        favicon.rel = "icon";
        document.head.appendChild(favicon);
      }
      favicon.href = dataUrl;
    });

    return () => {
      active = false;
    };
  }, [accentVariant]);

  // Encode every variant in the background so the first click on a new design
  // does not pay for image decoding.
  useEffect(() => {
    const sources = Object.values(brandingIcons);
    let cancelled = false;
    let cancelIdle: (() => void) | null = null;
    let index = 0;

    const step = () => {
      if (cancelled || index >= sources.length) return;
      void getIconDataUrl(sources[index++]).then(() => {
        if (!cancelled) cancelIdle = scheduleIdle(step);
      });
    };

    cancelIdle = scheduleIdle(step);

    return () => {
      cancelled = true;
      cancelIdle?.();
    };
  }, []);
}

import AppImage, { type ImageProps } from "./AppImage";
import { useEffect, useState, useRef } from "react";
import { markCoverReady, useCoverSrc } from "../lib/coverArt";
import { prepareCoverFallback } from "../lib/coverSigner";

type CoverImageProps = Omit<ImageProps, "src" | "onError" | "containerRef"> & {
  src: string;
  /** Defers loading until the cover is near the viewport (home rows). */
  lazy?: boolean;
};

// cover art renderer with automatic proxy fallback on direct cdn failure and self-healing retries
export default function CoverImage({
  src,
  onLoad,
  crossOrigin = "anonymous",
  lazy = false,
  ...rest
}: CoverImageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(!lazy);

  useEffect(() => {
    if (!lazy || visible) return;
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "250px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [lazy, visible]);

  const centralSrc = useCoverSrc(src, !lazy || visible);
  const [localFallback, setLocalFallback] = useState<string | undefined>(undefined);
  const [retryCount, setRetryCount] = useState(0);
  const [corsMode, setCorsMode] = useState<ImageProps["crossOrigin"]>(crossOrigin || undefined);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalFallback(undefined);
    setRetryCount(0);
    setCorsMode(crossOrigin || undefined);
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [src, crossOrigin]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  const effectiveSrc = localFallback || centralSrc || src;

  const handleError = () => {
    // If CORS mode failed (e.g. file:// origin in Electron or CDN lacks CORS headers),
    // immediately fallback to standard no-cors mode so artwork is never blank
    if (corsMode === "anonymous") {
      setCorsMode(undefined);
      return;
    }

    void prepareCoverFallback(src).then((resolved) => {
      if (resolved && resolved !== src) {
        setLocalFallback(resolved);
        return;
      }
      // If direct CDN had a transient network abort (e.g. during rapid skipping),
      // retry up to 2 times after brief debounce
      if (retryCount < 2) {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          setRetryCount((prev) => prev + 1);
        }, 250);
      }
    });
  };

  return (
    <AppImage
      {...rest}
      containerRef={containerRef}
      key={`${effectiveSrc}-${corsMode ?? "nocors"}-${retryCount}`}
      src={effectiveSrc}
      crossOrigin={corsMode}
      onLoad={(event) => {
        markCoverReady(src, effectiveSrc, event.currentTarget);
        onLoad?.(event);
      }}
      onError={handleError}
    />
  );
}

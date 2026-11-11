import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { LuEllipsis } from "react-icons/lu";
import { useTranslation } from "@/languages";
import { SpeedPitchPicker } from "./SpeedPitchPicker";
import { SleepTimerPanel } from "./SleepTimerPanel";
import { LyricsOptionsPanel } from "./LyricsOptionsPanel";

interface PlayerOptionsMenuProps {
  className?: string;
  trackId?: string | null;
  artworkSize: number;
  preferredArtworkSize?: number;
  onArtworkSizeChange?: (size: number) => void;
  onEditWordTiming?: () => void;
}

export function PlayerOptionsMenu({
  className = "",
  trackId,
  artworkSize,
  preferredArtworkSize,
  onArtworkSizeChange,
  onEditWordTiming,
}: PlayerOptionsMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [openSection, setOpenSection] = useState<"lyrics" | "sleep" | "speed" | null>(null);
  const [style, setStyle] = useState<CSSProperties>({ width: 280 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const artworkId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 12;
      const gap = 8;
      const width = Math.min(280, window.innerWidth - margin * 2);
      const maxHeight = Math.max(0, rect.top - gap - margin);
      const height = Math.min(panel.scrollHeight, maxHeight);
      setStyle({
        width,
        maxHeight,
        left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)),
        top: Math.max(margin, rect.top - gap - height),
      });
    };
    updatePosition();
    panelRef.current?.querySelector<HTMLElement>("input, button, [tabindex='0']")?.focus({ preventScroll: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updatePosition) : null;
    if (panelRef.current) observer?.observe(panelRef.current);
    window.addEventListener("resize", updatePosition);
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !panelRef.current?.contains(event.target)) updatePosition();
    };
    window.addEventListener("scroll", onScroll, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && !panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("focusin", onOutside);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("focusin", onOutside);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("player.options")}
        title={t("player.options")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        data-no-window-drag
        className={`${className} ${open ? "!bg-white/15 !opacity-100" : ""}`}
        onClick={() => {
          setOpen((value) => !value);
          setOpenSection(null);
        }}
      >
        <LuEllipsis size={20} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={t("player.options")}
          data-theme="dark"
          data-dropdown-menu="true"
          data-no-window-drag
          className="dark fixed z-[1000] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-[#1c1c1e]/95 p-2 text-text-primary shadow-2xl backdrop-blur-2xl"
          style={style}
        >
          {onArtworkSizeChange && (
            <div className="mb-1.5 flex flex-col gap-1.5 border-b border-white/[0.08] px-0.5 pb-2">
              <div className="flex items-center justify-between gap-3 text-[12px] font-medium">
                <label htmlFor={artworkId}>{t("player.artwork_size")}</label>
                <span className="tabular-nums text-[11px] font-normal text-text-secondary">
                  {preferredArtworkSize ?? artworkSize} px
                </span>
              </div>
              <input
                id={artworkId}
                type="range"
                min={180}
                max={640}
                step={10}
                value={preferredArtworkSize ?? artworkSize}
                onChange={(event) => onArtworkSizeChange(Number(event.target.value))}
                aria-label={t("player.artwork_size")}
                className="w-full cursor-pointer accent-white"
              />
            </div>
          )}
          <LyricsOptionsPanel
            trackId={trackId}
            collapsible
            expanded={openSection === "lyrics"}
            onToggle={() =>
              setOpenSection((current) => (current === "lyrics" ? null : "lyrics"))
            }
            onEditWordTiming={
              onEditWordTiming
                ? () => {
                    onEditWordTiming();
                    setOpen(false);
                  }
                : undefined
            }
          />
          <SleepTimerPanel
            collapsible
            expanded={openSection === "sleep"}
            onToggle={() =>
              setOpenSection((current) => (current === "sleep" ? null : "sleep"))
            }
          />
          <SpeedPitchPicker
            collapsible
            expanded={openSection === "speed"}
            onToggle={() =>
              setOpenSection((current) => (current === "speed" ? null : "speed"))
            }
          />
        </div>,
        document.body,
      )}
    </>
  );
}

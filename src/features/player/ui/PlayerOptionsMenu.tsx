import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { LuEllipsis } from "react-icons/lu";
import { useTranslation } from "@/languages";
import { SpeedPitchPicker } from "./SpeedPitchPicker";

interface PlayerOptionsMenuProps {
  className?: string;
  artworkSize: number;
  preferredArtworkSize?: number;
  onArtworkSizeChange?: (size: number) => void;
}

export function PlayerOptionsMenu({
  className = "",
  artworkSize,
  preferredArtworkSize,
  onArtworkSizeChange,
}: PlayerOptionsMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ width: 300 });
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
      const width = Math.min(300, window.innerWidth - margin * 2);
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const opensBelow = below >= panel.scrollHeight + gap + margin || below > above;
      const maxHeight = Math.max(0, (opensBelow ? below : above) - gap - margin);
      const height = Math.min(panel.scrollHeight, maxHeight);
      setStyle({
        width,
        maxHeight,
        left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)),
        top: Math.max(margin, opensBelow ? rect.bottom + gap : rect.top - gap - height),
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
        onClick={() => setOpen((value) => !value)}
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
          className="dark fixed z-[1000] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-[#1c1c1e]/95 p-3 text-text-primary shadow-2xl backdrop-blur-2xl"
          style={style}
        >
          {onArtworkSizeChange && (
            <div className="mb-3 flex flex-col gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center justify-between gap-3 text-[12px] font-medium">
                <label htmlFor={artworkId}>{t("player.artwork_size")}</label>
                <span className="tabular-nums text-text-secondary">{preferredArtworkSize ?? artworkSize} px</span>
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
          <SpeedPitchPicker />
        </div>,
        document.body,
      )}
    </>
  );
}

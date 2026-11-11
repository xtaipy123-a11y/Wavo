import { useEffect, useId, useMemo, useState } from "react";
import { LuTimer } from "react-icons/lu";
import { useTranslation } from "@/languages";
import { usePlayerState } from "../hooks/usePlayerState";
import { playerEngine } from "../engine/playerEngine";
import { MenuSection } from "./MenuSection";

const PRESET_MINUTES = [15, 30, 45, 60];
const MAX_CUSTOM_MINUTES = 1440;

interface SleepTimerPanelProps {
  /** Called after an action that should close a popup. */
  onAction?: () => void;
  className?: string;
  collapsible?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}

export function SleepTimerPanel({
  onAction,
  className = "",
  collapsible = false,
  expanded = false,
  onToggle,
}: SleepTimerPanelProps) {
  const { t } = useTranslation();
  const player = usePlayerState();
  const customInputId = useId();
  const [customMinutes, setCustomMinutes] = useState("");
  const [clockNow, setClockNow] = useState(Date.now());

  const timerActive = Boolean(player.sleepTimerEndAt || player.sleepAfterTrackId);

  useEffect(() => {
    if (!player.sleepTimerEndAt) return;
    setClockNow(Date.now());
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [player.sleepTimerEndAt]);

  const remainingMinutes = useMemo(
    () =>
      player.sleepTimerEndAt
        ? Math.max(0, Math.ceil((player.sleepTimerEndAt - clockNow) / 60_000))
        : null,
    [player.sleepTimerEndAt, clockNow],
  );

  const applyCustomMinutes = () => {
    const minutes = Math.round(Number(customMinutes));
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    playerEngine.setSleepTimerMinutes(Math.min(MAX_CUSTOM_MINUTES, minutes));
    setCustomMinutes(String(Math.min(MAX_CUSTOM_MINUTES, minutes)));
    onAction?.();
  };

  const summary = player.sleepAfterTrackId ? (
    t("player.sleep_after_track")
  ) : player.sleepTimerEndAt ? (
    <span className="tabular-nums text-emerald-400">
      {remainingMinutes ?? 0} {t("player.sleep_minutes_short")}
    </span>
  ) : (
    t("common.off")
  );

  const content = (
    <div className="flex flex-col gap-[3px]">
      {timerActive && (
        <div className="mb-1 rounded-lg bg-border-alpha-14 px-2 py-1 text-[11px] text-text-secondary">
          {player.sleepAfterTrackId
            ? t("player.sleep_after_track")
            : t("player.sleep_remaining", { minutes: remainingMinutes ?? 0 })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-[3px]">
        {PRESET_MINUTES.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className="flex w-full cursor-pointer rounded-md border-0 bg-white/[0.04] px-2 py-1 text-left text-[11px] text-text-primary transition-colors hover:bg-white/10"
            onClick={() => {
              playerEngine.setSleepTimerMinutes(minutes);
              onAction?.();
            }}
          >
            {t("player.sleep_in_minutes", { minutes })}
          </button>
        ))}
      </div>

      <form
        className="mt-1 flex flex-col gap-[3px]"
        onSubmit={(event) => {
          event.preventDefault();
          applyCustomMinutes();
        }}
      >
        <label
          htmlFor={customInputId}
          className="px-0.5 text-[10px] font-medium text-text-tertiary"
        >
          {t("player.sleep_custom_label")}
        </label>
        <div className="flex items-center gap-[5px]">
          <input
            id={customInputId}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_CUSTOM_MINUTES}
            step={1}
            value={customMinutes}
            placeholder={t("player.sleep_custom_placeholder")}
            onChange={(event) => setCustomMinutes(event.target.value)}
            className="h-[26px] min-w-0 flex-1 rounded-md border border-border-primary/50 bg-black/[0.04] px-[8px] text-[11px] text-text-primary outline-none focus:border-text-tertiary dark:bg-white/[0.06]"
          />
          <span className="text-[10px] text-text-tertiary">
            {t("player.sleep_minutes_short")}
          </span>
          <button
            type="submit"
            disabled={!customMinutes || Number(customMinutes) <= 0}
            className="h-[26px] shrink-0 cursor-pointer rounded-md border-0 bg-text-primary px-[10px] text-[11px] font-medium text-bg-primary transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
          >
            {t("player.sleep_custom_start")}
          </button>
        </div>
      </form>

      <button
        type="button"
        disabled={!player.currentTrack}
        className="mt-[3px] flex w-full cursor-pointer rounded-md border-0 bg-white/[0.04] px-2 py-1 text-left text-[11px] text-text-primary transition-colors hover:bg-white/10 disabled:cursor-default disabled:opacity-40"
        onClick={() => {
          playerEngine.sleepAfterCurrentTrack();
          onAction?.();
        }}
      >
        {t("player.sleep_after_track")}
      </button>

      {timerActive && (
        <button
          type="button"
          className="flex w-full cursor-pointer rounded-md border-0 bg-transparent px-2 py-1 text-left text-[11px] text-red-400 transition-colors hover:bg-red-500/10"
          onClick={() => {
            playerEngine.cancelSleepTimer();
            onAction?.();
          }}
        >
          {t("player.sleep_cancel")}
        </button>
      )}
    </div>
  );

  if (collapsible) {
    return (
      <MenuSection
        icon={<LuTimer size={14} className="text-text-secondary" aria-hidden="true" />}
        label={t("player.sleep_timer")}
        summary={summary}
        expanded={expanded}
        onToggle={onToggle ?? (() => {})}
      >
        {content}
      </MenuSection>
    );
  }

  return (
    <div className={`flex flex-col gap-[4px] ${className}`}>
      <div className="flex items-center gap-[6px] px-2 pb-2 text-[13px] font-semibold text-text-primary">
        <LuTimer size={15} />
        <span>{t("player.sleep_timer")}</span>
      </div>
      {content}
    </div>
  );
}

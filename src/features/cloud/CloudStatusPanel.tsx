import { useTranslation } from "@/languages";
import { activeCloudSync, useCloudStatus } from "./cloudSync";

export function CloudStatusPanel() {
  const { locale } = useTranslation();
  const de = locale === "de";
  const { state, pending, error, lastSyncedAt } = useCloudStatus();
  const label = { idle: de ? "Bereit" : "Ready", syncing: de ? "Synchronisiert …" : "Syncing …",
    synced: de ? "Synchronisiert" : "Synced", offline: "Offline", failed: de ? "Erneuter Versuch folgt" : "Retry scheduled" }[state];
  return <section className="rounded-2xl border border-border-primary/60 bg-bg-panel px-4 py-3 dark:border-transparent dark:bg-white/[0.035]">
    <h4 className="m-0 text-[13px] font-semibold text-text-primary">Wavo Cloud</h4>
    <p className="mb-2 mt-1 text-[12px] text-text-secondary">{label} · {pending} {de ? "ausstehende Änderungen" : "pending changes"}</p>
    {lastSyncedAt && <p className="my-1 text-[11px] text-text-tertiary">{de ? "Zuletzt" : "Last sync"}: {new Date(lastSyncedAt).toLocaleString(locale)}</p>}
    {error && <p role="alert" className="my-1 break-words text-[11px] text-red-300">{error}</p>}
    <button type="button" disabled={state === "syncing" || state === "offline"} onClick={() => void activeCloudSync?.sync()}
      className="rounded-[7px] border border-border-alpha-15 px-[9px] py-[5px] text-[11px] hover:bg-white/10 disabled:opacity-40">{de ? "Jetzt synchronisieren" : "Sync now"}</button>
  </section>;
}

import { useState } from "react";
import { useTranslation } from "@/languages";
import { eraseListeningHistory, loadMusicStats, type MusicStats, type StatsWindow } from "./musicStats";

export function MusicStatsPanel() {
  const { locale } = useTranslation();
  const de = locale === "de";
  const [period, setPeriod] = useState<StatsWindow>("month");
  const [stats, setStats] = useState<MusicStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = async (window: StatsWindow) => {
    setBusy(true); setError(null);
    try { setStats(await loadMusicStats(window)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const erase = async () => {
    if (!window.confirm(de ? "Deinen gesamten Wavo-Hörverlauf und die Statistiken dauerhaft löschen?" : "Permanently delete all Wavo listening history and statistics?")) return;
    setBusy(true); setError(null);
    try { await eraseListeningHistory(); setStats(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-border-primary/60 bg-bg-panel px-4 py-3 dark:border-transparent dark:bg-white/[0.035]">
    <h4 className="m-0 text-[13px] font-semibold text-text-primary">{de ? "Musikstatistiken · Wavo Wrapped" : "Music statistics · Wavo Wrapped"}</h4>
    <p className="mb-3 mt-1 text-[12px] text-text-tertiary">{de ? "Deine Hörzeit und Favoriten sind nur für dich sichtbar." : "Your listening time and favorites are visible only to you."}</p>
    <div className="flex flex-wrap gap-2">
      <select value={period} onChange={(event) => { const next = event.target.value as StatsWindow; setPeriod(next); if (stats) void refresh(next); }}
        className="rounded-lg border border-border-alpha-15 bg-bg-secondary px-2 py-1 text-[12px] text-text-primary">
        <option value="day">{de ? "Tag" : "Day"}</option><option value="week">{de ? "Woche" : "Week"}</option>
        <option value="month">{de ? "Monat" : "Month"}</option><option value="year">{de ? "Jahr" : "Year"}</option>
        <option value="all">{de ? "Gesamt" : "All time"}</option>
      </select>
      <button type="button" disabled={busy} onClick={() => void refresh(period)} className="rounded-lg border border-border-alpha-15 px-3 py-1 text-[12px] hover:bg-white/10 disabled:opacity-40">{de ? "Anzeigen" : "Show"}</button>
      <button type="button" disabled={busy} onClick={() => void erase()} className="rounded-lg border border-red-400/30 px-3 py-1 text-[12px] text-red-300 hover:bg-red-400/10 disabled:opacity-40">{de ? "Hörverlauf löschen" : "Delete history"}</button>
    </div>
    {error && <p role="alert" className="mt-2 text-[11px] text-red-300">{error}</p>}
    {stats && <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] text-text-secondary">
      <div className="rounded-lg bg-bg-secondary/60 p-2"><span className="block text-[17px] font-semibold text-text-primary">{Math.round(stats.minutes).toLocaleString(locale)}</span>{de ? "Minuten" : "minutes"}</div>
      <div className="rounded-lg bg-bg-secondary/60 p-2"><span className="block text-[17px] font-semibold text-text-primary">{stats.plays.toLocaleString(locale)}</span>{de ? "Wiedergaben" : "plays"}</div>
      {([ ["topTracks", de ? "Songs" : "Songs"], ["topArtists", de ? "Künstler" : "Artists"],
        ["topAlbums", de ? "Alben" : "Albums"], ["topGenres", "Genres"],
        ["topPlaylists", "Playlists"] ] as const).map(([key, label]) => <div key={key} className="col-span-2 rounded-lg bg-bg-secondary/60 p-2">
          <strong className="block text-text-primary">{label}</strong>
          {stats[key].length ? stats[key].slice(0, 5).map((item, index) => <div key={item.id} className="flex justify-between gap-2 py-0.5"><span className="truncate">{index + 1}. {item.name}</span><span>{Math.round(item.minutes)} min</span></div>) : <span>–</span>}
        </div>)}
    </div>}
  </section>;
}

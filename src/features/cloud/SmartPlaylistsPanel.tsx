import { useEffect, useState } from "react";
import { useTranslation } from "@/languages";
import { playerEngine } from "@/features/player";
import { toClientTrack } from "@/shared/api";
import { evaluateSmartRule, listSmartRules, removeSmartRule, saveSmartRule, type SmartRule } from "./smartPlaylists";

export function SmartPlaylistsPanel() {
  const { locale } = useTranslation();
  const de = locale === "de";
  const [rules, setRules] = useState<SmartRule[]>([]);
  const [name, setName] = useState("");
  const [artist, setArtist] = useState("");
  const [minPlayCount, setMinPlayCount] = useState(0);
  const [likedOnly, setLikedOnly] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => { try { setRules(listSmartRules()); } catch { setRules([]); } };
    refresh();
    window.addEventListener("wavo:smart-rules-changed", refresh);
    return () => window.removeEventListener("wavo:smart-rules-changed", refresh);
  }, []);
  return <section className="mt-[14px] rounded-[12px] border border-border-alpha-15 bg-bg-secondary/70 p-[13px]">
    <h3 className="m-0 text-[13px] font-semibold">{de ? "Smarte Playlists" : "Smart playlists"}</h3>
    <p className="mb-[9px] mt-[3px] text-[11px] text-text-tertiary">{de ? "Regeln aus Likes und Hörverlauf, auch offline verfügbar." : "Rules from likes and listening history, available offline."}</p>
    <div className="flex flex-wrap gap-[6px]">
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder={de ? "Name" : "Name"} maxLength={100}
        className="min-w-[100px] flex-1 rounded-[7px] border border-border-alpha-15 bg-bg-primary px-[8px] py-[6px] text-[11px] outline-none" />
      <input value={artist} onChange={(event) => setArtist(event.target.value)} placeholder={de ? "Künstler enthält …" : "Artist contains …"} maxLength={100}
        className="min-w-[100px] flex-1 rounded-[7px] border border-border-alpha-15 bg-bg-primary px-[8px] py-[6px] text-[11px] outline-none" />
      <label className="flex items-center gap-[4px] text-[11px] text-text-secondary">{de ? "Mind. Plays" : "Min plays"}<input type="number" min="0" max="1000" value={minPlayCount} onChange={(event) => setMinPlayCount(Number(event.target.value))}
        className="w-[55px] rounded-[7px] border border-border-alpha-15 bg-bg-primary px-[5px] py-[6px]" /></label>
      <label className="flex items-center gap-[4px] text-[11px] text-text-secondary"><input type="checkbox" checked={likedOnly} onChange={(event) => setLikedOnly(event.target.checked)} className="accent-accent" />{de ? "Nur Likes" : "Liked only"}</label>
      <button type="button" onClick={() => { try { saveSmartRule({ name, artistContains: artist, minPlayCount, likedOnly }); setName(""); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }}
        className="rounded-[7px] bg-accent px-[9px] py-[6px] text-[11px] text-white">{de ? "Erstellen" : "Create"}</button>
    </div>
    {rules.map((rule) => {
      const tracks = evaluateSmartRule(rule);
      return <div key={rule.id} className="mt-[8px] flex items-center gap-[7px] rounded-[7px] border border-border-alpha-15 px-[8px] py-[6px] text-[11px]">
        <span className="min-w-0 flex-1 truncate">{rule.name} · {tracks.length} {de ? "Songs" : "tracks"}</span>
        <button type="button" disabled={!tracks.length} onClick={() => { const queue = tracks.map(toClientTrack); void playerEngine.playTrack(queue[0], queue, `smart:${rule.id}`); }}
          className="rounded px-[5px] py-[3px] text-accent disabled:opacity-40">▶</button>
        <button type="button" onClick={() => removeSmartRule(rule.id)} title={de ? "Löschen" : "Delete"} className="rounded px-[5px] py-[3px] text-red-300">×</button>
      </div>;
    })}
    {error && <p role="alert" className="mt-[7px] text-[11px] text-red-300">{error}</p>}
  </section>;
}

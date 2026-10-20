import { getAuthSession } from "@/shared/api";
import { localMusic } from "@/shared/api/localMusic";
import type { Track } from "@/shared/contracts";

export type SmartRule = { id: string; name: string; artistContains: string; minPlayCount: number;
  likedOnly: boolean; createdAt: string; updatedAt: string };

function key(): string {
  const id = getAuthSession()?.user?.id;
  if (!id) throw new Error("Sign in required.");
  return `wavo_smart_rules_${id}`;
}

export function listSmartRules(): SmartRule[] {
  try { const result = JSON.parse(localStorage.getItem(key()) || "[]"); return Array.isArray(result) ? result as SmartRule[] : []; }
  catch { return []; }
}

function write(items: SmartRule[]) {
  localStorage.setItem(key(), JSON.stringify(items));
  window.dispatchEvent(new Event("wavo:smart-rules-changed"));
}

function changed(rule: SmartRule, deleted: boolean) {
  window.dispatchEvent(new CustomEvent("wavo:cloud-change", { detail: {
    kind: "smart_rule", id: rule.id, payload: deleted ? {} : rule, deleted,
  } }));
}

export function saveSmartRule(input: Pick<SmartRule, "name" | "artistContains" | "minPlayCount" | "likedOnly">, id?: string): SmartRule {
  const now = new Date().toISOString();
  const current = listSmartRules();
  const existing = id ? current.find((rule) => rule.id === id) : undefined;
  const rule: SmartRule = { id: id ?? crypto.randomUUID(), name: input.name.trim().slice(0, 100),
    artistContains: input.artistContains.trim().slice(0, 100), minPlayCount: Math.max(0, Math.min(1000, Math.floor(input.minPlayCount))),
    likedOnly: input.likedOnly, createdAt: existing?.createdAt ?? now, updatedAt: now };
  if (!rule.name) throw new Error("Name required.");
  write([rule, ...current.filter((item) => item.id !== rule.id)]);
  changed(rule, false);
  return rule;
}

export function removeSmartRule(id: string) {
  const current = listSmartRules();
  const existing = current.find((rule) => rule.id === id);
  if (!existing) return;
  write(current.filter((rule) => rule.id !== id));
  changed(existing, true);
}

export function applyRemoteSmartRule(id: string, payload: unknown, deleted: boolean) {
  const current = listSmartRules().filter((rule) => rule.id !== id);
  if (!deleted && payload && typeof payload === "object" && (payload as SmartRule).id === id) {
    current.unshift(payload as SmartRule);
  }
  write(current);
}

export function evaluateSmartRule(rule: SmartRule): Track[] {
  const liked = localMusic.cloudSnapshot().filter((item) => item.kind === "like")
    .map((item) => (item.payload as { track: Track }).track).filter(Boolean);
  const history = localMusic.cloudSnapshot().filter((item) => item.kind === "history")
    .map((item) => (item.payload as { track: Track }).track).filter(Boolean);
  const counts = new Map<string, number>();
  for (const track of history) counts.set(track.id, (counts.get(track.id) ?? 0) + 1);
  const likedIds = new Set(liked.map((track) => track.id));
  const unique = new Map<string, Track>();
  for (const track of [...liked, ...history]) if (!unique.has(track.id)) unique.set(track.id, track);
  return [...unique.values()].filter((track) =>
    (!rule.likedOnly || likedIds.has(track.id)) &&
    (counts.get(track.id) ?? 0) >= rule.minPlayCount &&
    (!rule.artistContains || track.artists.some((artist) => artist.name.toLowerCase().includes(rule.artistContains.toLowerCase())))
  ).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
}

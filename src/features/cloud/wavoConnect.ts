import { create } from "zustand";
import { getAuthSession } from "@/shared/api";
import { getSupabaseClient } from "@/shared/supabase/client";
import { usePlayerStore } from "@/features/player/store/playerStore";
import type { Track } from "@/shared/types";

export type DeviceCommand = "play" | "pause" | "next" | "previous" | "seek" | "volume" | "queue" | "transfer";
export type ConnectDevice = { device_id: string; display_name: string; platform: string; supports_volume: boolean;
  accepts_control: boolean; last_seen_at: string; playback_snapshot: Record<string, unknown> };
type ConnectState = { devices: ConnectDevice[]; selectedDeviceId: string | null; localDeviceId: string | null;
  localAcceptsControl: boolean; error: string | null };
export const useConnectStore = create<ConnectState>(() => ({ devices: [], selectedDeviceId: null, localDeviceId: null,
  localAcceptsControl: true, error: null }));

const isOnline = (device: ConnectDevice) => Date.now() - Date.parse(device.last_seen_at) < 45000;

function localId(): string {
  const key = "wavo_connect_device_id";
  // Browser tabs are separate playback targets; the desktop window keeps its identity.
  const storage = window.wavoElectron ? localStorage : sessionStorage;
  const saved = storage.getItem(key);
  if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
  const next = crypto.randomUUID();
  storage.setItem(key, next);
  return next;
}

function snapshot(): Record<string, unknown> {
  const s = usePlayerStore.getState();
  return { track: s.currentTrack, queue: s.queue.slice(0, 100), currentIndex: s.currentIndex,
    positionMs: s.positionMs, volume: s.volume, isPlaying: s.status === "playing",
    playbackContext: s.playbackContext, updatedAt: new Date().toISOString() };
}

export class WavoConnect {
  readonly deviceId = localId();
  private timer: ReturnType<typeof setInterval> | null = null;
  private channel: ReturnType<ReturnType<typeof getSupabaseClient>["channel"]> | null = null;
  private stopped = false;
  private checking = false;

  constructor(readonly userId: string) {}
  private authorized() { return !this.stopped && getAuthSession()?.user?.id === this.userId; }
  private controlKey() { return `wavo_connect_control_${this.userId}_${this.deviceId}`; }
  private acceptsControl() { return localStorage.getItem(this.controlKey()) !== "false"; }

  async setAcceptsControl(enabled: boolean) {
    localStorage.setItem(this.controlKey(), String(enabled));
    useConnectStore.setState({ localAcceptsControl: enabled });
    await this.heartbeat();
  }

  async refresh() {
    if (!this.authorized() || !navigator.onLine) return;
    const client = getSupabaseClient();
    const [{ data: devices, error }, { data: active, error: activeError }] = await Promise.all([
      client.from("wavo_devices").select("device_id,display_name,platform,supports_volume,accepts_control,last_seen_at,playback_snapshot")
        .eq("user_id", this.userId).order("last_seen_at", { ascending: false }).limit(30),
      client.from("wavo_active_devices").select("device_id").eq("user_id", this.userId).maybeSingle(),
    ]);
    if (error || activeError) throw error ?? activeError;
    useConnectStore.setState({ devices: (devices ?? []) as ConnectDevice[], selectedDeviceId: active?.device_id ?? this.deviceId, error: null });
    if (!active) await this.selectDevice(this.deviceId);
  }

  async heartbeat() {
    if (!this.authorized() || !navigator.onLine) return;
    const platform = window.wavoElectron ? "desktop" : "browser";
    const name = platform === "desktop" ? "Wavo Desktop" : `Wavo ${navigator.platform || "Browser"}`;
    const data = { user_id: this.userId, device_id: this.deviceId, display_name: name.slice(0, 80),
      platform, last_seen_at: new Date().toISOString(), playback_snapshot: snapshot(),
      supports_volume: true, accepts_control: this.acceptsControl() };
    const { error } = await getSupabaseClient().from("wavo_devices").upsert(data, { onConflict: "user_id,device_id" });
    if (error) throw error;
    await this.refresh();
  }

  async selectDevice(id: string) {
    if (!this.authorized()) return;
    const { error } = await getSupabaseClient().from("wavo_active_devices")
      .upsert({ user_id: this.userId, device_id: id, selected_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw error;
    useConnectStore.setState({ selectedDeviceId: id });
  }

  async send(targetId: string, kind: DeviceCommand, payload: Record<string, unknown> = {}) {
    if (!this.authorized()) throw new Error("Bitte erneut anmelden.");
    if (targetId === this.deviceId) { this.execute(kind, payload); return; }
    const device = useConnectStore.getState().devices.find((row) => row.device_id === targetId);
    if (!device || !isOnline(device) || !device.accepts_control) throw new Error("Gerät ist nicht erreichbar.");
    if (kind === "volume" && !device.supports_volume) throw new Error("Dieses Gerät unterstützt keine Lautstärkeregelung.");
    const { error } = await getSupabaseClient().from("wavo_device_commands").insert({
      user_id: this.userId, source_device_id: this.deviceId, target_device_id: targetId,
      kind, payload, expires_at: new Date(Date.now() + 30000).toISOString(),
    });
    if (error) throw error;
  }

  async transfer(targetId: string) {
    const current = useConnectStore.getState().devices.find((row) => row.device_id === useConnectStore.getState().selectedDeviceId);
    const localPlaying = usePlayerStore.getState().status === "playing" && Boolean(usePlayerStore.getState().currentTrack);
    const payload = targetId !== this.deviceId && localPlaying ? snapshot()
      : targetId === this.deviceId ? current?.playback_snapshot ?? snapshot()
      : current?.device_id === this.deviceId ? snapshot() : current?.playback_snapshot ?? snapshot();
    await this.send(targetId, "transfer", payload);
    await this.selectDevice(targetId);
    if (targetId !== this.deviceId && (localPlaying || current?.device_id === this.deviceId)) usePlayerStore.getState().dispatch({ type: "PAUSE_REQUESTED" });
    else if (current && current.device_id !== targetId) await this.send(current.device_id, "pause");
  }

  private execute(kind: DeviceCommand, payload: Record<string, unknown>) {
    const player = usePlayerStore.getState();
    switch (kind) {
      case "play": player.dispatch({ type: "RESUME_REQUESTED" }); break;
      case "pause": player.dispatch({ type: "PAUSE_REQUESTED" }); break;
      case "next": player.dispatch({ type: "SKIP_NEXT" }); break;
      case "previous": player.dispatch({ type: "SKIP_PREVIOUS" }); break;
      case "seek": if (typeof payload.positionMs === "number" && Number.isFinite(payload.positionMs))
        player.dispatch({ type: "SEEK_COMMITTED", positionMs: Math.max(0, payload.positionMs) }); break;
      case "volume": if (typeof payload.volume === "number" && Number.isFinite(payload.volume))
        player.dispatch({ type: "SET_VOLUME", volume: Math.max(0, Math.min(1, payload.volume)) }); break;
      case "queue": if (Array.isArray(payload.queue) && payload.queue.length <= 1000) player.setQueue(payload.queue as Track[]); break;
      case "transfer": {
        const track = payload.track as Track | undefined;
        const queue = Array.isArray(payload.queue) ? payload.queue as Track[] : [];
        if (!track?.id) break;
        player.dispatch({ type: "PLAY_REQUESTED", track, queue: queue.length ? queue : [track],
          context: typeof payload.playbackContext === "string" ? payload.playbackContext : null });
        if (typeof payload.positionMs === "number" && Number.isFinite(payload.positionMs)) {
          setTimeout(() => usePlayerStore.getState().dispatch({ type: "SEEK_COMMITTED", positionMs: payload.positionMs as number }), 500);
        }
        if (payload.isPlaying === false) setTimeout(() => usePlayerStore.getState().dispatch({ type: "PAUSE_REQUESTED" }), 550);
        break;
      }
    }
  }

  async processPending() {
    if (this.checking || !this.authorized() || !navigator.onLine) return;
    if (!this.acceptsControl()) return;
    this.checking = true;
    try {
      const { data, error } = await getSupabaseClient().from("wavo_device_commands")
        .select("id,kind,payload,expires_at").eq("user_id", this.userId).eq("target_device_id", this.deviceId)
        .is("processed_at", null).gt("expires_at", new Date().toISOString()).order("created_at").limit(50);
      if (error) throw error;
      for (const command of data ?? []) {
        if (!this.authorized()) return;
        // Claim first so a reconnect or second window cannot execute skip/seek twice.
        const { data: claimed, error: ackError } = await getSupabaseClient().from("wavo_device_commands")
          .update({ processed_at: new Date().toISOString() }).eq("id", command.id)
          .eq("target_device_id", this.deviceId).is("processed_at", null).select("id");
        if (ackError) throw ackError;
        if (claimed?.length) this.execute(command.kind as DeviceCommand, objectPayload(command.payload));
      }
    } finally { this.checking = false; }
  }

  start() {
    useConnectStore.setState({ localDeviceId: this.deviceId, localAcceptsControl: this.acceptsControl() });
    const client = getSupabaseClient();
    this.channel = client.channel(`wavo-connect-${this.userId}-${this.deviceId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wavo_device_commands", filter: `target_device_id=eq.${this.deviceId}` }, () => { void this.processPending(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "wavo_devices", filter: `user_id=eq.${this.userId}` }, () => { void this.refresh().catch(() => {}); })
      .on("postgres_changes", { event: "*", schema: "public", table: "wavo_active_devices", filter: `user_id=eq.${this.userId}` }, () => { void this.refresh().catch(() => {}); })
      .subscribe();
    const tick = async () => {
      try { await this.heartbeat(); await this.processPending(); }
      catch (error) { useConnectStore.setState({ error: error instanceof Error ? error.message : String(error) }); }
    };
    void tick();
    this.timer = setInterval(() => { void tick(); }, 15000);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.channel) void getSupabaseClient().removeChannel(this.channel);
    useConnectStore.setState({ devices: [], selectedDeviceId: null, localDeviceId: null });
  }
}

function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export let activeConnect: WavoConnect | null = null;
export function setActiveConnect(value: WavoConnect | null) { activeConnect = value; }

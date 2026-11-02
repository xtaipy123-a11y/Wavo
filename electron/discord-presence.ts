import { Client, type SetActivity } from "@xhayper/discord-rpc";
import { WAVO_DOWNLOAD_URL, type DiscordPlayback } from "../src/features/discord/contracts";

export const WAVO_DISCORD_CLIENT_ID = "1566904076623544360";
export const WAVO_DISCORD_LOGO_URL = "https://raw.githubusercontent.com/xtaipy123-a11y/Wavo/main/build/icon.png";
const UPDATE_INTERVAL_MS = 5000;
const RECONNECT_INTERVAL_MS = 15000;

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? Array.from(value.trim()).slice(0, 128).join("") : fallback;
}

export function normalizeDiscordPlayback(value: unknown): DiscordPlayback | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<DiscordPlayback>;
  if (typeof input.trackId !== "string" || !input.trackId || input.trackId.length > 512 ||
      typeof input.positionMs !== "number" || !Number.isFinite(input.positionMs) ||
      typeof input.durationMs !== "number" || !Number.isFinite(input.durationMs) || input.durationMs < 0 ||
      typeof input.playbackRate !== "number" || !Number.isFinite(input.playbackRate) || input.playbackRate <= 0 || input.playbackRate > 16) return null;
  return {
    trackId: input.trackId,
    title: text(input.title, "Unknown track"),
    artist: text(input.artist, "Unknown artist"),
    positionMs: Math.max(0, input.durationMs > 0 ? Math.min(input.positionMs, input.durationMs) : input.positionMs),
    durationMs: input.durationMs,
    playbackRate: input.playbackRate,
  };
}

export function buildDiscordActivity(playback: DiscordPlayback, sampledAt: number, now = Date.now()): SetActivity {
  const position = playback.positionMs + Math.max(0, now - sampledAt) * playback.playbackRate;
  const activity: SetActivity = {
    type: 2,
    details: playback.title,
    state: playback.artist,
    detailsUrl: WAVO_DOWNLOAD_URL,
    stateUrl: WAVO_DOWNLOAD_URL,
    largeImageKey: WAVO_DISCORD_LOGO_URL,
    largeImageText: "Wavo",
    largeImageUrl: WAVO_DOWNLOAD_URL,
    buttons: [{ label: "Download Wavo", url: WAVO_DOWNLOAD_URL }],
  };
  if (playback.durationMs > 0) {
    const boundedPosition = Math.min(position, playback.durationMs);
    // RPC accepts milliseconds; scale both timestamps so the bar follows playback speed.
    activity.startTimestamp = Math.round(now - boundedPosition / playback.playbackRate);
    activity.endTimestamp = Math.round(now + (playback.durationMs - boundedPosition) / playback.playbackRate);
  }
  return activity;
}

export class DiscordPresence {
  private client: Client | null = null;
  private playback: DiscordPlayback | null = null;
  private sampledAt = 0;
  private dirty = false;
  private sending: Client | null = null;
  private lastSentAt = -Infinity;
  private publishTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  update(value: unknown): void {
    if (this.destroyed) return;
    this.playback = normalizeDiscordPlayback(value);
    this.sampledAt = Date.now();
    this.dirty = true;
    if (!this.playback) {
      this.disconnect();
      return;
    }
    if (!this.client && !this.reconnectTimer) this.connect();
    this.schedulePublish();
  }

  private connect(): void {
    if (this.destroyed || !this.playback || this.client) return;
    const client = new Client({ clientId: WAVO_DISCORD_CLIENT_ID });
    this.client = client;
    client.on("connected", () => {
      if (this.client !== client) void client.destroy().catch(() => {});
    });
    client.on("ready", () => {
      if (this.client !== client) {
        void client.destroy().catch(() => {});
        return;
      }
      this.lastSentAt = -Infinity;
      this.dirty = true;
      this.schedulePublish();
    });
    client.on("disconnected", () => this.connectionLost(client));
    void client.login().catch(() => this.connectionLost(client));
  }

  private connectionLost(client: Client): void {
    if (this.client !== client) return;
    this.disconnect();
    if (this.destroyed || !this.playback) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, RECONNECT_INTERVAL_MS);
    this.reconnectTimer.unref?.();
  }

  private schedulePublish(): void {
    if (!this.client?.isConnected || !this.dirty || this.sending === this.client || this.publishTimer || !this.playback) return;
    const delay = Math.max(0, UPDATE_INTERVAL_MS - (Date.now() - this.lastSentAt));
    this.publishTimer = setTimeout(() => {
      this.publishTimer = undefined;
      void this.publish();
    }, delay);
    this.publishTimer.unref?.();
  }

  private async publish(): Promise<void> {
    const client = this.client;
    if (!client?.isConnected || !client.user || !this.playback) return;
    this.sending = client;
    this.dirty = false;
    this.lastSentAt = Date.now();
    try {
      await client.user.setActivity(buildDiscordActivity(this.playback, this.sampledAt));
    } catch {
      this.connectionLost(client);
    } finally {
      if (this.sending === client) this.sending = null;
      this.schedulePublish();
    }
  }

  private disconnect(): void {
    clearTimeout(this.publishTimer);
    clearTimeout(this.reconnectTimer);
    this.publishTimer = undefined;
    this.reconnectTimer = undefined;
    const client = this.client;
    this.client = null;
    // Closing the IPC connection also removes this process's activity, including pending updates.
    if (client) void client.destroy().catch(() => {});
  }

  destroy(): void {
    this.destroyed = true;
    this.playback = null;
    this.disconnect();
  }
}

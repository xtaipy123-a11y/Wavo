// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscordPlayback } from "../src/features/discord/contracts";
import { WAVO_DOWNLOAD_URL } from "../src/features/discord/contracts";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@xhayper/discord-rpc", () => ({ Client: class { constructor(options: unknown) { return createClient(options); } } }));
import { buildDiscordActivity, DiscordPresence, normalizeDiscordPlayback, WAVO_DISCORD_CLIENT_ID, WAVO_DISCORD_LOGO_URL } from "./discord-presence";

class FakeClient extends EventEmitter {
  isConnected = false;
  user = { setActivity: vi.fn().mockResolvedValue(undefined) };
  login = vi.fn(async () => { this.isConnected = true; this.emit("ready"); });
  destroy = vi.fn(async () => { this.isConnected = false; this.emit("disconnected"); });
}

const playback: DiscordPlayback = {
  trackId: "track-1", title: "A song", artist: "An artist", positionMs: 30000, durationMs: 180000, playbackRate: 1,
};
let clients: FakeClient[];
let presence: DiscordPresence;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T20:00:00Z"));
  clients = [];
  createClient.mockReset().mockImplementation(() => {
    const client = new FakeClient(); clients.push(client); return client;
  });
  presence = new DiscordPresence();
});
afterEach(() => { presence.destroy(); vi.useRealTimers(); });

describe("Discord activity", () => {
  it("shows the song, artist, Wavo logo and latest-release links with an accurate timeline", () => {
    const now = Date.now();
    const activity = buildDiscordActivity(playback, now - 10000, now);
    expect(activity).toMatchObject({
      type: 2, details: "A song", state: "An artist",
      startTimestamp: now - 40000, endTimestamp: now + 140000,
      largeImageKey: WAVO_DISCORD_LOGO_URL, largeImageText: "Wavo",
      largeImageUrl: WAVO_DOWNLOAD_URL, detailsUrl: WAVO_DOWNLOAD_URL, stateUrl: WAVO_DOWNLOAD_URL,
      buttons: [{ label: "Download Wavo", url: WAVO_DOWNLOAD_URL }],
    });
  });

  it("keeps the progress fraction and remaining wall time correct at double speed", () => {
    const now = Date.now();
    const activity = buildDiscordActivity({ ...playback, playbackRate: 2 }, now - 5000, now);
    expect(activity.startTimestamp).toBe(now - 20000);
    expect(activity.endTimestamp).toBe(now + 70000);
  });

  it("omits the timer until duration is known and clamps seeks to the track", () => {
    expect(buildDiscordActivity({ ...playback, durationMs: 0 }, Date.now())).not.toHaveProperty("startTimestamp");
    expect(normalizeDiscordPlayback({ ...playback, positionMs: -10 })?.positionMs).toBe(0);
    expect(normalizeDiscordPlayback({ ...playback, positionMs: 999999 })?.positionMs).toBe(180000);
  });

  it.each([{}, { ...playback, durationMs: NaN }, { ...playback, positionMs: Infinity }, { ...playback, playbackRate: 0 }])("rejects invalid IPC payloads", (value) => {
    expect(normalizeDiscordPlayback(value)).toBeNull();
  });

  it("bounds metadata and supplies missing artist information", () => {
    expect(normalizeDiscordPlayback({ ...playback, title: "x".repeat(200), artist: " " })).toMatchObject({
      title: "x".repeat(128), artist: "Unknown artist",
    });
  });
});

describe("Discord connection lifecycle", () => {
  it("connects using Wavo's application ID and publishes playback", async () => {
    presence.update(playback);
    await vi.advanceTimersByTimeAsync(0);
    expect(createClient).toHaveBeenCalledWith({ clientId: WAVO_DISCORD_CLIENT_ID });
    expect(clients[0].user.setActivity).toHaveBeenCalledWith(expect.objectContaining({ details: playback.title }));
  });

  it("coalesces rapid seeks and track changes into the most recent activity", async () => {
    presence.update(playback);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    presence.update({ ...playback, positionMs: 90000 });
    presence.update({ ...playback, trackId: "track-2", title: "Next song", positionMs: 0 });
    await vi.advanceTimersByTimeAsync(3999);
    expect(clients[0].user.setActivity).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(clients[0].user.setActivity).toHaveBeenCalledTimes(2);
    expect(clients[0].user.setActivity).toHaveBeenLastCalledWith(expect.objectContaining({ details: "Next song", startTimestamp: Date.now() - 4000 }));
  });

  it("immediately closes IPC on pause and cancels queued updates and retries", async () => {
    presence.update(playback);
    await vi.advanceTimersByTimeAsync(0);
    presence.update({ ...playback, positionMs: 90000 });
    presence.update(null);
    await vi.advanceTimersByTimeAsync(60000);
    expect(clients[0].destroy).toHaveBeenCalledOnce();
    expect(clients[0].user.setActivity).toHaveBeenCalledTimes(1);
    expect(clients).toHaveLength(1);
  });

  it("retries if Discord starts later, using the latest position", async () => {
    createClient.mockImplementationOnce(() => {
      const client = new FakeClient();
      client.login.mockRejectedValueOnce(new Error("Discord is not running"));
      clients.push(client); return client;
    });
    presence.update(playback);
    await vi.advanceTimersByTimeAsync(0);
    const sampledAt = Date.now();
    presence.update({ ...playback, positionMs: 90000 });
    await vi.advanceTimersByTimeAsync(15001);
    expect(clients).toHaveLength(2);
    expect(clients[1].user.setActivity).toHaveBeenCalledWith(expect.objectContaining({ startTimestamp: sampledAt - 90000 }));
  });

  it("restores the activity after Discord restarts", async () => {
    presence.update(playback);
    await vi.advanceTimersByTimeAsync(0);
    clients[0].isConnected = false;
    clients[0].emit("disconnected");
    await vi.advanceTimersByTimeAsync(15001);
    expect(clients).toHaveLength(2);
    expect(clients[1].user.setActivity).toHaveBeenCalledOnce();
  });

  it("recovers from failed activity requests without affecting playback", async () => {
    presence.update(playback);
    clients[0].user.setActivity.mockRejectedValueOnce(new Error("Connection lost"));
    await vi.advanceTimersByTimeAsync(15001);
    expect(clients).toHaveLength(2);
    expect(clients[1].user.setActivity).toHaveBeenCalledOnce();
  });

  it("drops in-flight activity when disabled and never reconnects after shutdown", async () => {
    presence.update(playback);
    let finish: (() => void) | undefined;
    clients[0].user.setActivity.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    await vi.advanceTimersByTimeAsync(0);
    presence.destroy();
    finish?.();
    presence.update(playback);
    await vi.advanceTimersByTimeAsync(60000);
    expect(clients).toHaveLength(1);
    expect(clients[0].destroy).toHaveBeenCalledOnce();
  });

  it("closes a late connection if playback was paused during login", async () => {
    createClient.mockImplementationOnce(() => {
      const client = new FakeClient();
      client.login.mockImplementationOnce(() => new Promise<void>(() => {}));
      clients.push(client); return client;
    });
    presence.update(playback);
    presence.update(null);
    clients[0].isConnected = true;
    clients[0].emit("connected");
    await vi.advanceTimersByTimeAsync(60000);
    expect(clients[0].isConnected).toBe(false);
    expect(clients[0].user.setActivity).not.toHaveBeenCalled();
    expect(clients).toHaveLength(1);
  });
});

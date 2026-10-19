import { describe, expect, it } from "vitest";
import type { ListeningRoom } from "./listeningClient";
import { expectedListeningPosition, isListeningRoomFresh } from "./listeningStore";

const base: ListeningRoom = {
  id: "8a991533-8f7f-450a-94f7-21a51e5f8378",
  host_id: "cc7c21d3-30a7-4adc-bc57-3a447e3dc64a",
  active: true,
  track_id: "song-1",
  track_title: "Song",
  position_ms: 30_000,
  is_playing: true,
  created_at: "2026-10-19T12:00:00.000Z",
  updated_at: "2026-10-19T12:00:00.000Z",
};

describe("listening position", () => {
  it("advances the host position while music is playing", () => {
    expect(expectedListeningPosition(base, Date.parse(base.updated_at) + 2500)).toBe(32_500);
  });

  it("holds the position while paused", () => {
    expect(expectedListeningPosition({ ...base, is_playing: false }, Date.parse(base.updated_at) + 9000)).toBe(30_000);
  });

  it("does not run indefinitely when the host disconnects", () => {
    const later = Date.parse(base.updated_at) + 30_000;
    expect(isListeningRoomFresh(base, later)).toBe(false);
    expect(expectedListeningPosition(base, later)).toBe(42_000);
  });
});

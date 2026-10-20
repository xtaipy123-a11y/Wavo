import { describe, expect, it } from "vitest";
import type { ListeningMember, ListeningRoom } from "./listeningClient";
import { canRequestListeningAction, expectedListeningPosition, isListeningRoomFresh, upcomingListeningQueue } from "./listeningStore";

const base: ListeningRoom = {
  id: "8a991533-8f7f-450a-94f7-21a51e5f8378",
  host_id: "cc7c21d3-30a7-4adc-bc57-3a447e3dc64a",
  active: true,
  track_id: "song-1",
  track_title: "Song",
  position_ms: 30_000,
  is_playing: true,
  allow_guest_add: true,
  allow_guest_skip: false,
  allow_guest_reorder: false,
  queue_snapshot: [],
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

describe("shared listening queue", () => {
  it("publishes only upcoming tracks with absolute positions for reorder requests", () => {
    const player = { currentIndex: 1, queue: [
      { id: "played", title: "Played", artists: "A" },
      { id: "current", title: "Current", artists: "B" },
      { id: "next", title: "Next", artists: "C" },
      { id: "later", title: "Later", artists: "D" },
    ] } as Parameters<typeof upcomingListeningQueue>[0];
    expect(upcomingListeningQueue(player)).toEqual([
      { index: 2, id: "next", title: "Next", artists: "C" },
      { index: 3, id: "later", title: "Later", artists: "D" },
    ]);
  });

  it("applies host defaults and individual guest overrides", () => {
    const member: ListeningMember = { room_id: base.id, user_id: "8245247a-4094-4e81-8b62-b02d9412f694",
      invited_by: base.host_id, status: "active", created_at: base.created_at, joined_at: base.created_at,
      can_add: null, can_skip: true, can_reorder: false };
    expect(canRequestListeningAction(base, member, member.user_id, "add")).toBe(true);
    expect(canRequestListeningAction(base, member, member.user_id, "skip")).toBe(true);
    expect(canRequestListeningAction(base, member, member.user_id, "move")).toBe(false);
    expect(canRequestListeningAction(base, { ...member, status: "invited" }, member.user_id, "add")).toBe(false);
    expect(canRequestListeningAction(base, undefined, base.host_id, "move")).toBe(true);
  });
});

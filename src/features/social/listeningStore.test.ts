import { describe, expect, it } from "vitest";
import type { ListeningMember, ListeningRoom } from "./listeningClient";
import {
  advanceListeningAnchor,
  canRequestListeningAction,
  estimateListeningClockSkew,
  expectedAnchorPosition,
  isListeningAnchorFresh,
  upcomingListeningQueue,
} from "./listeningStore";

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

describe("listening playback anchor", () => {
  it("advances the host position while music is playing", () => {
    const anchor = advanceListeningAnchor(null, base);
    expect(expectedAnchorPosition(anchor, 0, Date.parse(base.updated_at) + 2_500)).toBe(32_500);
  });

  it("holds the position while paused", () => {
    const anchor = advanceListeningAnchor(null, { ...base, is_playing: false });
    expect(expectedAnchorPosition(anchor, 0, Date.parse(base.updated_at) + 9_000)).toBe(30_000);
  });

  it("only re-anchors when the host playback actually changes", () => {
    const anchor = advanceListeningAnchor(null, base);
    expect(anchor).toMatchObject({ trackId: "song-1", positionMs: 30_000, isPlaying: true });
    const same = advanceListeningAnchor(anchor, { ...base, updated_at: "2026-10-19T12:00:05.000Z" });
    expect(same).toBe(anchor);
    const seeked = advanceListeningAnchor(anchor, { ...base, position_ms: 45_000, updated_at: "2026-10-19T12:00:06.000Z" });
    expect(seeked.positionMs).toBe(45_000);
    expect(seeked.signature).not.toBe(anchor.signature);
  });

  it("uses the fastest server sample to estimate clock skew", () => {
    const updatedAt = Date.parse("2026-10-19T12:00:10.000Z");
    const room = { ...base, updated_at: new Date(updatedAt).toISOString() };
    const skew = 1_200;
    const poll = estimateListeningClockSkew(room, updatedAt - skew + 4_000, null);
    const realtime = estimateListeningClockSkew(room, updatedAt - skew + 300, poll);
    expect(poll).toBe(-2_800);
    expect(realtime).toBe(900);
  });

  it("computes the expected host position despite a skewed device clock", () => {
    const serverAt = Date.parse("2026-10-19T12:00:10.000Z");
    const anchor = advanceListeningAnchor(null, { ...base, updated_at: new Date(serverAt).toISOString() });
    const skew = 3_600_000;
    const localNow = serverAt + 2_500 - skew;
    expect(expectedAnchorPosition(anchor, skew, localNow)).toBe(32_500);
    expect(isListeningAnchorFresh(anchor, skew, localNow)).toBe(true);
    expect(isListeningAnchorFresh(anchor, skew, localNow + 20_000)).toBe(false);
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

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListeningRoom } from "./listeningClient";

const snapshot = vi.fn();

vi.mock("./listeningClient", () => ({
  currentListeningUserId: () => "host",
  listeningClient: { snapshot: () => snapshot() },
}));

import { useListeningStore } from "./listeningStore";

const room = (patch: Partial<ListeningRoom> = {}): ListeningRoom => ({
  id: "8a991533-8f7f-450a-94f7-21a51e5f8378",
  host_id: "host",
  active: true,
  track_id: "song-1",
  track_title: "Song",
  position_ms: 30_000,
  is_playing: true,
  allow_guest_add: true,
  allow_guest_skip: false,
  allow_guest_reorder: false,
  queue_snapshot: [],
  playlist_id: null,
  playlist_title: null,
  playlist_cover_url: null,
  playlist_track_count: 0,
  playlist_duration_ms: 0,
  playlist_tracks: [],
  repeat_mode: "off",
  shuffle: false,
  created_at: "2026-10-19T12:00:00.000Z",
  updated_at: "2026-10-19T12:00:00.000Z",
  ...patch,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("listening refresh", () => {
  beforeEach(() => {
    snapshot.mockReset();
    useListeningStore.setState({ room: null, members: [], invitations: [], error: "" });
  });

  it("does not revert a host track change with a snapshot that was already in flight", async () => {
    useListeningStore.setState({ room: room() });
    const pending = deferred<{ room: ListeningRoom | null; members: []; invitations: [] }>();
    snapshot.mockReturnValueOnce(pending.promise);

    const refresh = useListeningStore.getState().refresh();
    // The host skips while the poll request is still on the wire.
    useListeningStore.getState().applyHostPlayback({
      trackId: "song-2",
      trackTitle: "Next song",
      positionMs: 0,
      isPlaying: true,
      queue: [],
    });
    pending.resolve({ room: room(), members: [], invitations: [] });
    await refresh;

    expect(useListeningStore.getState().room).toMatchObject({
      track_id: "song-2",
      track_title: "Next song",
    });
  });

  it("applies a snapshot that was requested after the host mirrored playback", async () => {
    useListeningStore.setState({ room: room() });
    useListeningStore.getState().applyHostPlayback({
      trackId: "song-2",
      trackTitle: "Next song",
      positionMs: 0,
      isPlaying: true,
      queue: [],
    });
    snapshot.mockResolvedValueOnce({ room: room({ track_id: "song-2", track_title: "Next song" }), members: [], invitations: [] });

    await useListeningStore.getState().refresh();

    expect(useListeningStore.getState().room).toMatchObject({ track_id: "song-2" });
  });

  it("applies the snapshot when no local playback change happened", async () => {
    useListeningStore.setState({ room: room() });
    snapshot.mockResolvedValueOnce({ room: room({ is_playing: false }), members: [], invitations: [] });

    await useListeningStore.getState().refresh();

    expect(useListeningStore.getState().room?.is_playing).toBe(false);
  });
});

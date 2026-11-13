import {
  expectedAnchorPosition,
  type ListeningPlaybackAnchor,
} from "./listeningStore";

/**
 * The guest's view of the host clock. It is published by `ListeningSync` and
 * read by the lyrics views so a guest whose local audio element is stalled
 * still sees the right line and word highlighted.
 */
export interface ListeningFollowClock {
  roomId: string;
  trackId: string | null;
  isGuest: boolean;
  anchor: ListeningPlaybackAnchor;
  clockSkewMs: number;
}

let clock: ListeningFollowClock | null = null;
const listeners = new Set<() => void>();

export function setListeningFollowClock(next: ListeningFollowClock | null): void {
  clock = next;
  listeners.forEach((listener) => listener());
}

export function clearListeningFollowClock(roomId?: string): void {
  if (roomId && clock?.roomId !== roomId) return;
  setListeningFollowClock(null);
}

export function getListeningFollowClock(): ListeningFollowClock | null {
  return clock;
}

export function subscribeListeningFollowClock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Extrapolated host position in milliseconds, or null when the published
 * clock does not belong to the requested track.
 */
export function listeningFollowPositionMs(
  trackId: string | null,
  now = Date.now(),
  snapshot = clock,
): number | null {
  if (!snapshot || !trackId || snapshot.trackId !== trackId) return null;
  return expectedAnchorPosition(snapshot.anchor, snapshot.clockSkewMs, now);
}

export function isListeningFollowPlaying(
  trackId: string | null,
  snapshot = clock,
): boolean {
  return Boolean(snapshot && trackId && snapshot.trackId === trackId && snapshot.anchor.isPlaying);
}

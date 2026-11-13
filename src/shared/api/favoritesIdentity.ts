import { getDevGuestId } from "./devIdentity";

export function getFavoritesOwnerId(userId?: string | null): string | null {
  if (userId) return userId;
  // Keep development favorites separate from every real account.
  return getDevGuestId();
}

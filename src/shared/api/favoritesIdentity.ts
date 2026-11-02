export function getFavoritesOwnerId(userId?: string | null): string | null {
  if (userId) return userId;
  // Keep development favorites separate from every real account.
  return import.meta.env.DEV && import.meta.env.VITE_DEV_SKIP_LOGIN !== "false"
    ? "dev-guest"
    : null;
}

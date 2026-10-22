// Keep a private share token in memory while the user signs in. Never persist it in localStorage.
let pendingToken: string | null = null;

export function setPendingReleaseToken(token: string) {
  pendingToken = token;
}

export function takePendingReleaseToken(): string | null {
  const token = pendingToken;
  pendingToken = null;
  return token;
}

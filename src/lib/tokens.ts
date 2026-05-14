// Persists the room-scoped secrets the server hands back from RPCs.
//
// • upload_token  — proves to add_photo that this browser owns an uploader row.
// • session_token — proves to submit_guess that this browser is a given player.
//
// Hosting is gated by URL knowledge (anyone on /host/<code> is the host),
// so no host_token is stored here.
//
// Both live in localStorage so a refresh or a reopened tab keeps you in
// the same role. They're scoped by room code so different rooms don't
// stomp on each other.

export type TokenScope = 'upload' | 'session';

const storageKey = (scope: TokenScope, code: string): string =>
  `photo-game:${scope}:${code.toUpperCase()}`;

export function getToken(scope: TokenScope, code: string): string | null {
  return localStorage.getItem(storageKey(scope, code));
}

export function setToken(scope: TokenScope, code: string, token: string): void {
  localStorage.setItem(storageKey(scope, code), token);
}

export function clearToken(scope: TokenScope, code: string): void {
  localStorage.removeItem(storageKey(scope, code));
}

export function clearAllTokensForRoom(code: string): void {
  for (const scope of ['upload', 'session'] as const) {
    clearToken(scope, code);
  }
}

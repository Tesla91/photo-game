// Room-scoped identity stashes that pair with the secrets in tokens.ts:
//
// • The uploader stash records who you are when re-opening the upload link
//   (so a refresh doesn't make you re-type your name).
// • The player stash records who you joined as on the play screen.
//
// Tokens (host/upload/session) prove identity to the server; these
// stashes give the UI the surrounding context (id, display name) without
// extra round-trips.

export type UploaderIdentity = {
  uploaderId: string;
  name: string;
};

const uploaderKey = (code: string): string =>
  `photo-game:uploader:${code.toUpperCase()}`;

export function getUploaderIdentity(code: string): UploaderIdentity | null {
  const raw = localStorage.getItem(uploaderKey(code));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UploaderIdentity;
  } catch {
    return null;
  }
}

export function setUploaderIdentity(code: string, value: UploaderIdentity): void {
  localStorage.setItem(uploaderKey(code), JSON.stringify(value));
}

export function clearUploaderIdentity(code: string): void {
  localStorage.removeItem(uploaderKey(code));
}

const confirmedKey = (code: string): string =>
  `photo-game:upload-confirmed:${code.toUpperCase()}`;

export function isUploadConfirmed(code: string): boolean {
  return localStorage.getItem(confirmedKey(code)) === '1';
}

export function setUploadConfirmed(code: string, confirmed: boolean): void {
  if (confirmed) localStorage.setItem(confirmedKey(code), '1');
  else localStorage.removeItem(confirmedKey(code));
}

export type PlayerIdentity = {
  playerId: string;
  uploaderId: string;
  name: string;
};

const playerKey = (code: string): string =>
  `photo-game:player:${code.toUpperCase()}`;

export function getPlayerIdentity(code: string): PlayerIdentity | null {
  const raw = localStorage.getItem(playerKey(code));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlayerIdentity;
  } catch {
    return null;
  }
}

export function setPlayerIdentity(code: string, value: PlayerIdentity): void {
  localStorage.setItem(playerKey(code), JSON.stringify(value));
}

export function clearPlayerIdentity(code: string): void {
  localStorage.removeItem(playerKey(code));
}

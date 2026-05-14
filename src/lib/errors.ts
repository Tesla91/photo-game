// Turn the messy server / Postgres error string into something a friend
// looking at their phone won't bounce off. Falls through to the raw text
// for anything we haven't seen — keeps the trailing escape hatch honest.

export function humanizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const low = raw.toLowerCase();

  if (low.includes('cannot guess on your own photo'))
    return "That's your photo — you can't guess on it.";
  if (low.includes('reveal the current photo first'))
    return 'Reveal the current photo before moving on.';
  if (low.includes('unauthorized'))
    return 'Only the host can do that.';
  if (low.includes('room not found'))
    return "We can't find that room.";
  if (low.includes('game not in progress'))
    return 'The game has either not started yet or is already over.';
  if (low.includes('can only guess on the current photo'))
    return 'The host has moved on. Wait for the next photo.';
  if (low.includes('invalid session'))
    return 'Your session expired. Refresh and rejoin.';
  if (low.includes('invalid upload token'))
    return 'Your upload session expired. Refresh and enter your name again.';
  if (low.includes('photo limit reached'))
    return "You've already filled all your slots.";
  if (
    low.includes('not accepting uploads') ||
    low.includes('not accepting changes')
  )
    return 'Uploads are closed for this room.';
  if (low.includes('duplicate') || low.includes('unique'))
    return 'That name is already taken in this room. Try another.';
  if (low.includes('photos_per_player must be'))
    return 'Photos per player must be between 1 and 20.';
  if (low.includes('no photos uploaded'))
    return 'No photos uploaded yet — you need at least one to start.';
  if (low.includes('no current photo'))
    return 'No photo is being shown right now.';
  if (low.includes('failed to fetch') || low.includes('networkerror'))
    return 'Network problem. Check your connection and try again.';
  if (low.includes('bucket not found'))
    return 'Storage bucket missing — ask the project owner to apply the latest migration.';
  if (low.includes('row violates row-level security'))
    return "That action isn't allowed.";

  return raw;
}

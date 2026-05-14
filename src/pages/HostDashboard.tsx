import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getRoomByCode,
  listPhotosForRoom,
  listUploaders,
  type Photo,
  type Room,
  type Uploader,
} from '../lib/api';
import { subscribeRoomUploads } from '../lib/realtime';
import { getToken } from '../lib/tokens';

type Status = 'loading' | 'ready' | 'not_found' | 'error';

function mergeById<T extends { id: string }>(prev: T[], next: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of prev) byId.set(item.id, item);
  for (const item of next) byId.set(item.id, item);
  return Array.from(byId.values());
}

function sortByCreatedAt<T extends { created_at: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function HostDashboard() {
  const { code: codeParam = '' } = useParams<{ code: string }>();
  const code = codeParam.toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [uploaders, setUploaders] = useState<Uploader[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  const hostToken = getToken('host', code);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      try {
        const r = await getRoomByCode(code);
        if (cancelled) return;
        if (!r) {
          setStatus('not_found');
          return;
        }
        setRoom(r);

        // Subscribe BEFORE the initial fetch so events fired while we're
        // fetching aren't lost. Add-events use dedup, so a row that
        // arrives via both paths is only stored once.
        cleanup = subscribeRoomUploads(r.id, {
          onUploaderAdded: (u) =>
            setUploaders((prev) => sortByCreatedAt(mergeById(prev, [u]))),
          onPhotoAdded: (p) =>
            setPhotos((prev) => sortByCreatedAt(mergeById(prev, [p]))),
          onPhotoRemoved: (id) =>
            setPhotos((prev) => prev.filter((p) => p.id !== id)),
        });

        const [u, p] = await Promise.all([
          listUploaders(r.id),
          listPhotosForRoom(r.id),
        ]);
        if (cancelled) return;
        setUploaders((prev) => sortByCreatedAt(mergeById(prev, u)));
        setPhotos((prev) => sortByCreatedAt(mergeById(prev, p)));
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [code]);

  const photoCountByUploader = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of photos) {
      if (p.uploader_id)
        counts.set(p.uploader_id, (counts.get(p.uploader_id) ?? 0) + 1);
    }
    return counts;
  }, [photos]);

  if (status === 'loading') {
    return <main className="p-6 text-slate-400">Loading room…</main>;
  }
  if (status === 'not_found') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Room not found</h1>
          <p className="text-slate-400">No room with code {code}.</p>
          <Link to="/" className="text-indigo-400 hover:text-indigo-300">
            Back to start
          </Link>
        </div>
      </main>
    );
  }
  if (status === 'error' || !room) {
    return (
      <main className="p-6">
        <p className="text-red-400">Couldn't load the room: {error}</p>
      </main>
    );
  }

  const uploadUrl = `${window.location.origin}${import.meta.env.BASE_URL}#/r/${code}`;
  const canStart = uploaders.length >= 2 && photos.length > 0;

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto space-y-8">
      <header className="space-y-1">
        <p className="text-sm text-slate-500 uppercase tracking-wider">Room</p>
        <h1 className="text-4xl font-mono font-bold">{code}</h1>
        <p className="text-slate-400">
          {room.photos_per_player} photo
          {room.photos_per_player === 1 ? '' : 's'} per player
        </p>
      </header>

      {!hostToken && (
        <div className="rounded-lg bg-yellow-900/30 border border-yellow-700/60 p-4 space-y-1">
          <p className="font-semibold">You're not the host of this room.</p>
          <p className="text-sm text-slate-300">
            This browser doesn't have the host token. Only the device that
            created the room can start the game.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Share this link</h2>
        <div className="flex gap-2">
          <input
            readOnly
            value={uploadUrl}
            onFocus={(e) => e.target.select()}
            className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(uploadUrl)}
            className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm transition-colors"
          >
            Copy
          </button>
        </div>
        <p className="text-sm text-slate-500">
          Anyone with this link can upload photos until you start the game.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Uploaders ({uploaders.length})
        </h2>
        {uploaders.length === 0 ? (
          <p className="text-slate-400">
            No one's uploaded yet. Send the link to your friends.
          </p>
        ) : (
          <ul className="space-y-2">
            {uploaders.map((u) => {
              const count = photoCountByUploader.get(u.id) ?? 0;
              const done = count >= room.photos_per_player;
              return (
                <li
                  key={u.id}
                  className="flex items-center justify-between rounded-lg bg-slate-900 border border-slate-800 px-4 py-3"
                >
                  <span>{u.name}</span>
                  <span
                    className={
                      done
                        ? 'text-emerald-400 text-sm font-mono'
                        : 'text-slate-400 text-sm font-mono'
                    }
                  >
                    {count}/{room.photos_per_player}
                    {done ? ' ✓' : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <button
        type="button"
        disabled={!canStart || !hostToken}
        className="w-full rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed py-3 font-semibold transition-colors"
      >
        {canStart
          ? 'Start game'
          : uploaders.length < 2
            ? 'Need at least 2 uploaders'
            : 'Waiting for photos'}
      </button>
    </main>
  );
}

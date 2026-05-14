import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QrCode } from '../components/QrCode';
import {
  getPhotoPublicUrl,
  getRoomByCode,
  listPhotosForRoom,
  listUploaders,
  nextPhoto,
  revealCurrentPhoto,
  startGame,
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
  const [busy, setBusy] = useState<'start' | 'reveal' | 'next' | null>(null);

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

  const uploaderById = useMemo(() => {
    const map = new Map<string, Uploader>();
    for (const u of uploaders) map.set(u.id, u);
    return map;
  }, [uploaders]);

  const currentPhoto = useMemo(() => {
    if (!room?.current_photo_id) return null;
    return photos.find((p) => p.id === room.current_photo_id) ?? null;
  }, [room?.current_photo_id, photos]);

  const inGamePhotos = useMemo(
    () =>
      [...photos]
        .filter((p) => p.play_order !== null)
        .sort((a, b) => (a.play_order ?? 0) - (b.play_order ?? 0)),
    [photos],
  );

  const onStart = async () => {
    if (!hostToken || !room) return;
    setBusy('start');
    setError(null);
    try {
      await startGame(code, hostToken);
      const r = await getRoomByCode(code);
      if (r) {
        setRoom(r);
        setPhotos(await listPhotosForRoom(r.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const onReveal = async () => {
    if (!hostToken || !currentPhoto) return;
    setBusy('reveal');
    setError(null);
    try {
      await revealCurrentPhoto(code, hostToken);
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === currentPhoto.id ? { ...p, revealed: true } : p,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const onNext = async () => {
    if (!hostToken) return;
    setBusy('next');
    setError(null);
    try {
      const nextId = await nextPhoto(code, hostToken);
      if (nextId === null) {
        setRoom((r) =>
          r ? { ...r, state: 'finished', current_photo_id: null } : r,
        );
      } else {
        setRoom((r) => (r ? { ...r, current_photo_id: nextId } : r));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

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

  // ============ In-game phase ============================================
  if (room.state === 'in_game') {
    const playUrl = `${window.location.origin}${import.meta.env.BASE_URL}#/play/${code}`;
    const position = currentPhoto?.play_order ?? 0;
    const total = inGamePhotos.length;
    const uploaderName =
      currentPhoto?.revealed && currentPhoto.uploader_id
        ? (uploaderById.get(currentPhoto.uploader_id)?.name ?? 'Unknown')
        : null;

    return (
      <main className="min-h-screen p-6 max-w-3xl mx-auto space-y-6">
        <header className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Photo {position} of {total}
            </p>
            <h1 className="text-3xl font-mono font-bold">{code}</h1>
          </div>
          <p className="text-xs text-slate-500">
            Players join at <code className="text-slate-300">/play/{code}</code>
          </p>
        </header>

        <div className="rounded-lg overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center">
          {currentPhoto ? (
            <img
              src={getPhotoPublicUrl(currentPhoto.storage_path)}
              alt=""
              className="max-h-[60vh] w-auto max-w-full object-contain"
            />
          ) : (
            <p className="p-8 text-slate-400">No current photo</p>
          )}
        </div>

        {uploaderName ? (
          <div className="rounded-lg bg-emerald-900/30 border border-emerald-700/60 p-4 text-center space-y-1">
            <p className="text-xs uppercase tracking-wider text-slate-400">
              Uploaded by
            </p>
            <p className="text-3xl font-bold">{uploaderName}</p>
          </div>
        ) : (
          <div className="rounded-lg bg-slate-900 border border-slate-800 p-4 text-center text-slate-400 text-sm">
            Players are guessing. Reveal when you're ready.
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onReveal}
            disabled={!hostToken || currentPhoto?.revealed || busy !== null}
            className="flex-1 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed py-3 font-semibold transition-colors"
          >
            {busy === 'reveal'
              ? 'Revealing…'
              : currentPhoto?.revealed
                ? 'Revealed'
                : 'Reveal'}
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hostToken || busy !== null}
            className="flex-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed py-3 font-semibold transition-colors"
          >
            {busy === 'next' ? 'Loading…' : 'Next'}
          </button>
        </div>

        <details className="rounded-lg bg-slate-900 border border-slate-800 group">
          <summary className="cursor-pointer px-4 py-3 text-sm text-slate-300 list-none flex items-center justify-between">
            <span>Late join — show QR + code</span>
            <span className="text-slate-500 text-xs group-open:hidden">show</span>
            <span className="text-slate-500 text-xs hidden group-open:inline">
              hide
            </span>
          </summary>
          <div className="border-t border-slate-800 px-4 py-4 flex flex-col items-center gap-3">
            <QrCode value={playUrl} size={220} />
            <div className="text-center space-y-1">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Room code
              </p>
              <p className="text-3xl font-mono font-bold">{code}</p>
            </div>
          </div>
        </details>
      </main>
    );
  }

  // ============ Finished phase ===========================================
  if (room.state === 'finished') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-4xl font-bold">Game finished</h1>
          <p className="text-slate-400">
            That was the last photo. A summary screen lands in the next commit.
          </p>
          <Link to="/" className="text-indigo-400 hover:text-indigo-300 inline-block">
            Back to start
          </Link>
        </div>
      </main>
    );
  }

  // ============ Uploading phase ==========================================
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

      {hostToken && (
        <details className="rounded-lg bg-slate-900 border border-slate-800 group">
          <summary className="cursor-pointer px-4 py-3 text-sm text-slate-300 list-none flex items-center justify-between">
            <span>Re-host on another device</span>
            <span className="text-slate-500 text-xs group-open:hidden">show</span>
            <span className="text-slate-500 text-xs hidden group-open:inline">hide</span>
          </summary>
          <div className="border-t border-slate-800 px-4 py-3 space-y-3 text-sm">
            <p className="text-slate-400">
              Save these somewhere safe. Paste them at{' '}
              <code className="text-slate-300">/host/rejoin</code> on another
              device or browser to resume hosting this room.
            </p>
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-slate-500">
                Code
              </div>
              <div className="font-mono">{code}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-slate-500">
                Host token
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  type="text"
                  value={hostToken}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 rounded-md bg-slate-950 border border-slate-800 px-2 py-1.5 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(hostToken)}
                  className="rounded-md bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </details>
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

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onStart}
        disabled={!canStart || !hostToken || busy !== null}
        className="w-full rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed py-3 font-semibold transition-colors"
      >
        {busy === 'start'
          ? 'Starting…'
          : canStart
            ? 'Start game'
            : uploaders.length < 2
              ? 'Need at least 2 uploaders'
              : 'Waiting for photos'}
      </button>
    </main>
  );
}

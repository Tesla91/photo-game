import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getPhotoPublicUrl,
  getRoomByCode,
  joinAsPlayer,
  listPhotosForRoom,
  listUploaders,
  type Photo,
  type Room,
  type Uploader,
} from '../lib/api';
import {
  getPlayerIdentity,
  setPlayerIdentity,
  type PlayerIdentity,
} from '../lib/identity';
import { subscribePlayerRoom } from '../lib/realtime';
import { setToken } from '../lib/tokens';

type Status =
  | 'loading'
  | 'not_found'
  | 'not_started'
  | 'pick_identity'
  | 'playing'
  | 'finished'
  | 'error';

export function Play() {
  const { code: codeParam = '' } = useParams<{ code: string }>();
  const code = codeParam.toUpperCase();

  const [status, setStatus] = useState<Status>('loading');
  const [room, setRoom] = useState<Room | null>(null);
  const [uploaders, setUploaders] = useState<Uploader[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [identity, setIdentityState] = useState<PlayerIdentity | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localGuess, setLocalGuess] = useState<string | null>(null);

  const currentPhoto = useMemo(() => {
    if (!room?.current_photo_id) return null;
    return photos.find((p) => p.id === room.current_photo_id) ?? null;
  }, [room?.current_photo_id, photos]);

  const guessableUploaders = useMemo(() => {
    if (!identity) return uploaders;
    return uploaders.filter((u) => u.id !== identity.uploaderId);
  }, [uploaders, identity]);

  const uploaderById = useMemo(() => {
    const map = new Map<string, Uploader>();
    for (const u of uploaders) map.set(u.id, u);
    return map;
  }, [uploaders]);

  // Reset local guess when the photo changes.
  useEffect(() => {
    setLocalGuess(null);
  }, [currentPhoto?.id]);

  const resolveStatus = (r: Room, hasIdentity: boolean): Status => {
    if (r.state === 'uploading') return 'not_started';
    if (r.state === 'finished') return 'finished';
    if (!hasIdentity) return 'pick_identity';
    return 'playing';
  };

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

        const stash = getPlayerIdentity(code);
        if (stash) setIdentityState(stash);

        cleanup = subscribePlayerRoom(r.id, {
          onRoomChanged: ({ state, current_photo_id }) => {
            setRoom((prev) =>
              prev ? { ...prev, state, current_photo_id } : prev,
            );
          },
          onPhotoUpdated: (p) => {
            setPhotos((prev) => prev.map((x) => (x.id === p.id ? p : x)));
          },
        });

        const [u, p] = await Promise.all([
          listUploaders(r.id),
          listPhotosForRoom(r.id),
        ]);
        if (cancelled) return;
        setUploaders(u);
        setPhotos(p);
        setStatus(resolveStatus(r, !!stash));
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

  // Re-evaluate status whenever room state or identity changes.
  useEffect(() => {
    if (!room) return;
    if (status === 'loading' || status === 'not_found' || status === 'error') {
      return;
    }
    const next = resolveStatus(room, !!identity);
    if (next !== status) setStatus(next);
  }, [room, identity, status]);

  const onPickIdentity = async (uploader: Uploader) => {
    setJoining(uploader.id);
    setError(null);
    try {
      const { player_id, session_token } = await joinAsPlayer(code, uploader.id);
      setToken('session', code, session_token);
      const stash: PlayerIdentity = {
        playerId: player_id,
        uploaderId: uploader.id,
        name: uploader.name,
      };
      setPlayerIdentity(code, stash);
      setIdentityState(stash);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setJoining(null);
    }
  };

  if (status === 'loading') {
    return <main className="p-6 text-slate-400">Loading…</main>;
  }

  if (status === 'not_found') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold">Room not found</h1>
          <p className="text-slate-400">No room with code {code}.</p>
          <Link to="/" className="text-indigo-400 hover:text-indigo-300 inline-block">
            Back to start
          </Link>
        </div>
      </main>
    );
  }

  if (status === 'error' || !room) {
    return (
      <main className="p-6 space-y-3">
        <p className="text-red-400">Something went wrong: {error}</p>
        <Link to="/" className="text-indigo-400 hover:text-indigo-300">
          Back to start
        </Link>
      </main>
    );
  }

  if (status === 'not_started') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-sm">
          <p className="text-sm text-slate-500 uppercase tracking-wider">
            Room {code}
          </p>
          <h1 className="text-3xl font-bold">Waiting for the host</h1>
          <p className="text-slate-400">
            The game hasn't started yet. This page will update automatically
            once the host hits Start.
          </p>
        </div>
      </main>
    );
  }

  if (status === 'finished') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-sm">
          <p className="text-sm text-slate-500 uppercase tracking-wider">
            Room {code}
          </p>
          <h1 className="text-3xl font-bold">Game over</h1>
          <p className="text-slate-400">A full recap lands in a later commit.</p>
        </div>
      </main>
    );
  }

  if (status === 'pick_identity') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <header className="space-y-2 text-center">
            <p className="text-sm text-slate-500 uppercase tracking-wider">
              Room {code}
            </p>
            <h1 className="text-3xl font-bold">Who are you?</h1>
            <p className="text-slate-400">
              Pick your name from the uploaders. Other players see this only
              after each reveal.
            </p>
          </header>

          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <ul className="space-y-2">
            {uploaders.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => onPickIdentity(u)}
                  disabled={joining !== null}
                  className="w-full rounded-lg bg-slate-900 border border-slate-800 hover:border-indigo-500 hover:bg-slate-800 px-4 py-3 text-left transition-colors disabled:opacity-40 disabled:cursor-wait"
                >
                  {joining === u.id ? 'Joining…' : u.name}
                </button>
              </li>
            ))}
          </ul>

          {uploaders.length === 0 && (
            <p className="text-slate-400 text-sm text-center">
              No uploaders in this room. Ask the host to check.
            </p>
          )}
        </div>
      </main>
    );
  }

  // status === 'playing'
  const revealed = currentPhoto?.revealed ?? false;
  const revealedUploader =
    revealed && currentPhoto?.uploader_id
      ? (uploaderById.get(currentPhoto.uploader_id)?.name ?? 'Unknown')
      : null;

  return (
    <main className="min-h-screen p-4 max-w-md mx-auto space-y-4">
      <header className="flex items-baseline justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Room {code}
          </p>
          <p className="text-sm text-slate-300">Playing as {identity?.name}</p>
        </div>
      </header>

      <div className="rounded-lg overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center">
        {currentPhoto ? (
          <img
            src={getPhotoPublicUrl(currentPhoto.storage_path)}
            alt=""
            className="max-h-[55vh] w-auto max-w-full object-contain"
          />
        ) : (
          <p className="p-8 text-slate-400">Waiting for the host…</p>
        )}
      </div>

      {revealed ? (
        <div className="rounded-lg bg-emerald-900/30 border border-emerald-700/60 p-4 text-center space-y-1">
          <p className="text-xs uppercase tracking-wider text-slate-400">
            Uploaded by
          </p>
          <p className="text-2xl font-bold">{revealedUploader}</p>
          {localGuess && (
            <p className="text-sm text-slate-300 pt-1">
              You guessed{' '}
              <span className="font-semibold">
                {uploaderById.get(localGuess)?.name ?? '…'}
              </span>
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-center text-sm text-slate-400">
            Who uploaded this?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {guessableUploaders.map((u) => {
              const selected = localGuess === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setLocalGuess(u.id)}
                  className={[
                    'rounded-lg px-3 py-3 font-medium text-sm transition-colors border',
                    selected
                      ? 'bg-indigo-500 border-indigo-400 text-white'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-600',
                  ].join(' ')}
                >
                  {u.name}
                </button>
              );
            })}
          </div>
          {localGuess && (
            <p className="text-center text-xs text-slate-500">
              Locked in locally. Server-side guess submission lands next commit.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
    </main>
  );
}

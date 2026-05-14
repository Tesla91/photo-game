import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Leaderboard } from '../components/Leaderboard';
import {
  getPhotoPublicUrl,
  getRoomByCode,
  joinAsPlayer,
  listGuessesForRoom,
  listPhotosForRoom,
  listPlayersForRoom,
  listUploaders,
  submitGuess,
  type Guess,
  type Photo,
  type Player,
  type Room,
  type Uploader,
} from '../lib/api';
import {
  getPlayerIdentity,
  setPlayerIdentity,
  type PlayerIdentity,
} from '../lib/identity';
import { subscribePlayerRoom } from '../lib/realtime';
import { getToken, setToken } from '../lib/tokens';

type Status =
  | 'loading'
  | 'not_found'
  | 'not_started'
  | 'pick_identity'
  | 'playing'
  | 'finished'
  | 'error';

function mergeById<T extends { id: string }>(prev: T[], next: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of prev) byId.set(item.id, item);
  for (const item of next) byId.set(item.id, item);
  return Array.from(byId.values());
}

export function Play() {
  const { code: codeParam = '' } = useParams<{ code: string }>();
  const code = codeParam.toUpperCase();

  const [status, setStatus] = useState<Status>('loading');
  const [room, setRoom] = useState<Room | null>(null);
  const [uploaders, setUploaders] = useState<Uploader[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [identity, setIdentityState] = useState<PlayerIdentity | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPhoto = useMemo(() => {
    if (!room?.current_photo_id) return null;
    return photos.find((p) => p.id === room.current_photo_id) ?? null;
  }, [room?.current_photo_id, photos]);

  const uploaderById = useMemo(() => {
    const map = new Map<string, Uploader>();
    for (const u of uploaders) map.set(u.id, u);
    return map;
  }, [uploaders]);

  const guessableUploaders = useMemo(() => {
    if (!identity) return uploaders;
    return uploaders.filter((u) => u.id !== identity.uploaderId);
  }, [uploaders, identity]);

  const revealedPhotoIds = useMemo(
    () => new Set(photos.filter((p) => p.revealed).map((p) => p.id)),
    [photos],
  );

  const myGuessForCurrent = useMemo(() => {
    if (!identity || !currentPhoto) return null;
    return (
      guesses.find(
        (g) =>
          g.player_id === identity.playerId && g.photo_id === currentPhoto.id,
      ) ?? null
    );
  }, [guesses, identity, currentPhoto]);

  const isMyOwnPhoto = useMemo(
    () =>
      !!identity &&
      !!currentPhoto?.uploader_id &&
      currentPhoto.uploader_id === identity.uploaderId,
    [identity, currentPhoto],
  );

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
          onRoomChanged: ({ state, current_photo_id }) =>
            setRoom((prev) =>
              prev ? { ...prev, state, current_photo_id } : prev,
            ),
          onPhotoUpdated: (p) =>
            setPhotos((prev) => prev.map((x) => (x.id === p.id ? p : x))),
          onGuessAdded: (g) =>
            setGuesses((prev) =>
              prev.some((x) => x.id === g.id) ? prev : [...prev, g],
            ),
          onPlayerJoined: (p) =>
            setPlayers((prev) =>
              prev.some((x) => x.id === p.id) ? prev : [...prev, p],
            ),
        });

        const [u, p, pl, gu] = await Promise.all([
          listUploaders(r.id),
          listPhotosForRoom(r.id),
          listPlayersForRoom(r.id),
          listGuessesForRoom(r.id),
        ]);
        if (cancelled) return;
        setUploaders(u);
        setPhotos(p);
        setPlayers((prev) => mergeById(prev, pl));
        setGuesses((prev) => mergeById(prev, gu));
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

  const onGuess = async (uploaderId: string) => {
    if (!identity || !currentPhoto) return;
    const token = getToken('session', code);
    if (!token) {
      setError('Your session has expired. Refresh and re-join.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitGuess(code, token, currentPhoto.id, uploaderId);
      // Realtime INSERT will populate guesses; refetch as a safety net in
      // case the channel hasn't fired yet by the time the user clicks again.
      const gu = await listGuessesForRoom(room!.id);
      setGuesses((prev) => mergeById(prev, gu));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
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
        <div className="w-full max-w-md space-y-6">
          <header className="text-center space-y-2">
            <p className="text-sm text-slate-500 uppercase tracking-wider">
              Room {code}
            </p>
            <h1 className="text-3xl font-bold">Game over</h1>
            <p className="text-slate-400">Final standings:</p>
          </header>
          <Leaderboard
            players={players}
            uploaders={uploaders}
            guesses={guesses}
            revealedPhotoIds={revealedPhotoIds}
            highlightPlayerId={identity?.playerId}
          />
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
  const revealedUploaderName =
    revealed && currentPhoto?.uploader_id
      ? (uploaderById.get(currentPhoto.uploader_id)?.name ?? 'Unknown')
      : null;
  const myGuessedName = myGuessForCurrent
    ? (uploaderById.get(myGuessForCurrent.guessed_uploader_id)?.name ?? '…')
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
          <p className="text-2xl font-bold">{revealedUploaderName}</p>
          {isMyOwnPhoto ? (
            <p className="text-sm text-slate-300 pt-1">That's yours.</p>
          ) : myGuessForCurrent ? (
            <p className="text-sm text-slate-300 pt-1">
              You guessed{' '}
              <span className="font-semibold">{myGuessedName}</span>
              {myGuessForCurrent.is_correct ? ' ✓' : ' ✗'}
            </p>
          ) : (
            <p className="text-sm text-slate-500 pt-1">
              No guess submitted.
            </p>
          )}
        </div>
      ) : isMyOwnPhoto ? (
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-4 text-center text-slate-300">
          This is your photo. Sit back while everyone else guesses.
        </div>
      ) : myGuessForCurrent ? (
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-4 text-center space-y-1">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Locked in
          </p>
          <p className="text-lg font-semibold">{myGuessedName}</p>
          <p className="text-sm text-slate-500">Waiting for the reveal…</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-center text-sm text-slate-400">
            Who uploaded this?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {guessableUploaders.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => onGuess(u.id)}
                disabled={submitting}
                className="rounded-lg px-3 py-3 font-medium text-sm transition-colors border bg-slate-900 border-slate-800 hover:border-slate-600 disabled:opacity-40 disabled:cursor-wait"
              >
                {u.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {revealed && (
        <Leaderboard
          players={players}
          uploaders={uploaders}
          guesses={guesses}
          revealedPhotoIds={revealedPhotoIds}
          highlightPlayerId={identity?.playerId}
        />
      )}
    </main>
  );
}

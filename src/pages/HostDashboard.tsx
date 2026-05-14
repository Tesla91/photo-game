import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRoomByCode, listUploaders, type Room, type Uploader } from '../lib/api';
import { getToken } from '../lib/tokens';

export function HostDashboard() {
  const { code: codeParam = '' } = useParams<{ code: string }>();
  const code = codeParam.toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [uploaders, setUploaders] = useState<Uploader[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const hostToken = getToken('host', code);

  const reload = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const r = await getRoomByCode(code);
      if (!r) {
        setStatus('not_found');
        return;
      }
      setRoom(r);
      setUploaders(await listUploaders(r.id));
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [code]);

  useEffect(() => {
    reload();
  }, [reload]);

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
        <button onClick={reload} className="mt-3 text-indigo-400 hover:text-indigo-300">
          Try again
        </button>
      </main>
    );
  }

  const uploadUrl = `${window.location.origin}${import.meta.env.BASE_URL}#/r/${code}`;
  const canStart = uploaders.length >= 2;

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto space-y-8">
      <header className="space-y-1">
        <p className="text-sm text-slate-500 uppercase tracking-wider">Room</p>
        <h1 className="text-4xl font-mono font-bold">{code}</h1>
        <p className="text-slate-400">
          {room.photos_per_player} photo{room.photos_per_player === 1 ? '' : 's'} per
          player
        </p>
      </header>

      {!hostToken && (
        <div className="rounded-lg bg-yellow-900/30 border border-yellow-700/60 p-4 space-y-1">
          <p className="font-semibold">You're not the host of this room.</p>
          <p className="text-sm text-slate-300">
            This browser doesn't have the host token. Only the device that created
            the room can start the game.
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
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">
            Uploaders ({uploaders.length})
          </h2>
          <button
            type="button"
            onClick={reload}
            className="text-sm text-indigo-400 hover:text-indigo-300"
          >
            Refresh
          </button>
        </div>
        {uploaders.length === 0 ? (
          <p className="text-slate-400">
            No one's uploaded yet. Send the link to your friends.
          </p>
        ) : (
          <ul className="space-y-2">
            {uploaders.map((u) => (
              <li
                key={u.id}
                className="rounded-lg bg-slate-900 border border-slate-800 px-4 py-3"
              >
                {u.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        disabled={!canStart || !hostToken}
        className="w-full rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed py-3 font-semibold transition-colors"
      >
        {canStart ? 'Start game' : 'Need at least 2 uploaders'}
      </button>
    </main>
  );
}

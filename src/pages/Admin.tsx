import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminDeleteRoom,
  adminListRooms,
  type AdminRoom,
} from '../lib/api';

const ADMIN_TOKEN_KEY = 'photo-game:admin-token';

function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}
function setStoredAdminToken(t: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, t);
}
function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

function fmt(date: string): string {
  return new Date(date).toLocaleString();
}

function copyToClipboard(text: string): void {
  void navigator.clipboard?.writeText(text);
}

export function Admin() {
  const [token, setToken] = useState<string | null>(getAdminToken());
  const [tokenInput, setTokenInput] = useState('');
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [revealedTokens, setRevealedTokens] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const r = await adminListRooms(token);
      setRooms(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('unauthor')) {
        clearAdminToken();
        setToken(null);
        setError('Token rejected. Try again.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  const submitToken = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    setStoredAdminToken(trimmed);
    setToken(trimmed);
  };

  const handleDelete = async (room: AdminRoom) => {
    if (!token) return;
    const ok = window.confirm(
      `Delete room ${room.code}? This removes ${room.photo_count} photo${
        room.photo_count === 1 ? '' : 's'
      } from storage and every uploader / guess attached to it. Can't be undone.`,
    );
    if (!ok) return;
    setDeletingId(room.id);
    try {
      await adminDeleteRoom(token, room.id);
      setRooms((prev) => prev.filter((r) => r.id !== room.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  };

  const logout = () => {
    clearAdminToken();
    setToken(null);
    setTokenInput('');
    setRooms([]);
    setRevealedTokens(new Set());
  };

  const toggleHostToken = (id: string) => {
    setRevealedTokens((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <form onSubmit={submitToken} className="w-full max-w-md space-y-6">
          <header className="space-y-2 text-center">
            <h1 className="text-3xl font-bold">Admin</h1>
            <p className="text-slate-400 text-sm">
              Enter the admin token. Find or rotate it in your Supabase project:{' '}
              <code className="text-slate-300">
                select admin_token from admin_config
              </code>
              .
            </p>
          </header>

          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            autoFocus
            required
            placeholder="Admin token"
            className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 font-mono text-sm focus:outline-none focus:border-indigo-500"
          />

          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!tokenInput.trim()}
            className="w-full rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed py-3 font-semibold transition-colors"
          >
            Continue
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Admin</h1>
        <div className="flex gap-3 items-center text-sm">
          <button
            onClick={reload}
            disabled={loading}
            className="text-indigo-400 hover:text-indigo-300 disabled:opacity-40"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            onClick={logout}
            className="text-slate-400 hover:text-slate-200"
          >
            Log out
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {rooms.length === 0 && !loading ? (
        <p className="text-slate-400">No rooms yet.</p>
      ) : (
        <ul className="space-y-3">
          {rooms.map((room) => {
            const revealed = revealedTokens.has(room.id);
            const isDeleting = deletingId === room.id;
            return (
              <li
                key={room.id}
                className="rounded-lg bg-slate-900 border border-slate-800 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/host/${room.code}`}
                        className="text-xl font-mono font-bold text-indigo-400 hover:text-indigo-300"
                      >
                        {room.code}
                      </Link>
                      <span
                        className={[
                          'text-xs uppercase tracking-wider px-2 py-0.5 rounded',
                          room.state === 'uploading'
                            ? 'bg-amber-900/40 text-amber-300'
                            : room.state === 'in_game'
                              ? 'bg-emerald-900/40 text-emerald-300'
                              : 'bg-slate-800 text-slate-400',
                        ].join(' ')}
                      >
                        {room.state}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Created {fmt(room.created_at)} · Expires{' '}
                      {fmt(room.expires_at)}
                    </p>
                    {room.host_message && (
                      <p className="text-xs text-slate-400 italic max-w-prose">
                        "{room.host_message}"
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(room)}
                    disabled={isDeleting}
                    className="text-sm rounded-lg bg-red-900/40 hover:bg-red-700 border border-red-800 px-3 py-1.5 disabled:opacity-40 disabled:cursor-wait transition-colors"
                  >
                    {isDeleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-slate-500 text-xs">Photos / player</span>
                    <p className="font-mono">{room.photos_per_player}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Uploaders</span>
                    <p className="font-mono">{room.uploader_count}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Photos</span>
                    <p className="font-mono">{room.photo_count}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">host token</span>
                  <button
                    type="button"
                    onClick={() => toggleHostToken(room.id)}
                    className="text-indigo-400 hover:text-indigo-300"
                  >
                    {revealed ? 'hide' : 'show'}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(room.host_token)}
                    className="text-indigo-400 hover:text-indigo-300"
                  >
                    copy
                  </button>
                  {revealed && (
                    <code className="font-mono text-slate-400 break-all">
                      {room.host_token}
                    </code>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

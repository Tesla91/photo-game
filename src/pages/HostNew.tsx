import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom } from '../lib/api';
import { setToken } from '../lib/tokens';

export function HostNew() {
  const navigate = useNavigate();
  const [photosPerPlayer, setPhotosPerPlayer] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { code, host_token } = await createRoom(photosPerPlayer);
      setToken('host', code, host_token);
      navigate(`/host/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-8">
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">New room</h1>
          <p className="text-slate-400">
            Pick how many photos each friend uploads. You can share the link right
            away — uploads stay open until you start the game.
          </p>
        </header>

        <label className="block space-y-2">
          <span className="text-sm text-slate-400">Photos per player</span>
          <input
            type="number"
            min={1}
            max={20}
            value={photosPerPlayer}
            onChange={(e) => setPhotosPerPlayer(Number(e.target.value))}
            required
            className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 focus:outline-none focus:border-indigo-500"
          />
        </label>

        {error && (
          <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed py-3 font-semibold transition-colors"
        >
          {submitting ? 'Creating…' : 'Create room'}
        </button>
      </form>
    </main>
  );
}

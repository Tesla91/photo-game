import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export function Landing() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-10">
        <header className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Photo Guess</h1>
          <p className="text-slate-400">
            Everyone uploads photos. Then we guess who uploaded what.
          </p>
        </header>

        <section className="space-y-3">
          <button
            type="button"
            onClick={() => navigate('/host/new')}
            className="w-full rounded-lg bg-indigo-500 hover:bg-indigo-400 transition-colors py-3 font-semibold"
          >
            Create a room
          </button>
        </section>

        <section className="space-y-3">
          <label htmlFor="code" className="block text-sm text-slate-400">
            Have a code from someone?
          </label>
          <div className="flex gap-2">
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC-12"
              className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 focus:outline-none focus:border-indigo-500"
              maxLength={10}
            />
            <button
              type="button"
              disabled={code.length < 3}
              onClick={() => navigate(`/r/${code}`)}
              className="rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 font-semibold transition-colors"
            >
              Join
            </button>
          </div>
        </section>

        <p className="text-center text-sm text-slate-500">
          Already hosting a room?{' '}
          <Link
            to="/host/rejoin"
            className="text-indigo-400 hover:text-indigo-300"
          >
            Resume hosting
          </Link>
        </p>
      </div>
    </main>
  );
}

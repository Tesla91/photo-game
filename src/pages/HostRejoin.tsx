import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { verifyHostToken } from '../lib/api';
import { humanizeError } from '../lib/errors';
import { setToken } from '../lib/tokens';

export function HostRejoin() {
  useDocumentTitle('Resume hosting • Photo Guess');
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [hostToken, setHostTokenInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedCode = code.trim().toUpperCase();
    const trimmedToken = hostToken.trim();
    if (!trimmedCode || !trimmedToken) return;

    setSubmitting(true);
    setError(null);
    try {
      const ok = await verifyHostToken(trimmedCode, trimmedToken);
      if (!ok) {
        setError("That code and token don't match. Double-check both.");
        setSubmitting(false);
        return;
      }
      setToken('host', trimmedCode, trimmedToken);
      navigate(`/host/${trimmedCode}`);
    } catch (err) {
      setError(humanizeError(err));
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">Resume hosting</h1>
          <p className="text-slate-400 text-sm">
            Paste the room code and host token you saved when you first created
            the room. Both came from the host dashboard — they're stored in your
            other browser's localStorage too.
          </p>
        </header>

        <label className="block space-y-2">
          <span className="text-sm text-slate-400">Room code</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoFocus
            required
            maxLength={10}
            placeholder="ABC12"
            className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 font-mono focus:outline-none focus:border-indigo-500"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-slate-400">Host token</span>
          <textarea
            value={hostToken}
            onChange={(e) => setHostTokenInput(e.target.value)}
            required
            rows={3}
            placeholder="64 hex characters"
            className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 font-mono text-xs focus:outline-none focus:border-indigo-500 resize-none"
          />
        </label>

        {error && (
          <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !code.trim() || !hostToken.trim()}
          className="w-full rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed py-3 font-semibold transition-colors"
        >
          {submitting ? 'Checking…' : 'Resume hosting'}
        </button>
      </form>
    </main>
  );
}

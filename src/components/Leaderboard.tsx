import { useMemo } from 'react';
import type { Guess, Player, Uploader } from '../lib/api';

type Props = {
  players: Player[];
  uploaders: Uploader[];
  guesses: Guess[];
  revealedPhotoIds: Set<string>;
  highlightPlayerId?: string;
};

export function Leaderboard({
  players,
  uploaders,
  guesses,
  revealedPhotoIds,
  highlightPlayerId,
}: Props) {
  const scores = useMemo(() => {
    const uploaderById = new Map(uploaders.map((u) => [u.id, u.name]));
    return players
      .map((p) => {
        const correct = guesses.filter(
          (g) =>
            g.player_id === p.id &&
            g.is_correct &&
            revealedPhotoIds.has(g.photo_id),
        ).length;
        return {
          playerId: p.id,
          name: uploaderById.get(p.uploader_id) ?? '?',
          correct,
        };
      })
      .sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name));
  }, [players, uploaders, guesses, revealedPhotoIds]);

  if (scores.length === 0) return null;

  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 p-4 space-y-2">
      <h3 className="text-xs uppercase tracking-wider text-slate-500">
        Leaderboard
      </h3>
      <ul className="space-y-1.5">
        {scores.map((s, i) => {
          const isMe = highlightPlayerId === s.playerId;
          return (
            <li
              key={s.playerId}
              className={[
                'flex items-center justify-between text-sm rounded px-2 py-1',
                isMe ? 'bg-indigo-500/15 text-indigo-100' : '',
              ].join(' ')}
            >
              <span className="flex items-center gap-2">
                <span className="text-slate-500 font-mono w-5 text-right">
                  {i + 1}
                </span>
                <span>{s.name}</span>
                {isMe && (
                  <span className="text-xs text-indigo-300">(you)</span>
                )}
              </span>
              <span className="font-mono text-slate-200">{s.correct}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import { useMemo } from 'react';
import {
  getPhotoPublicUrl,
  type Guess,
  type Photo,
  type Player,
  type Uploader,
} from '../lib/api';
import { Leaderboard } from './Leaderboard';

type Props = {
  uploaders: Uploader[];
  photos: Photo[];
  players: Player[];
  guesses: Guess[];
  highlightPlayerId?: string;
};

type PhotoStat = {
  photo: Photo;
  uploaderName: string;
  correct: number;
  total: number;
};

export function GameSummary({
  uploaders,
  photos,
  players,
  guesses,
  highlightPlayerId,
}: Props) {
  const uploaderById = useMemo(() => {
    const map = new Map<string, Uploader>();
    for (const u of uploaders) map.set(u.id, u);
    return map;
  }, [uploaders]);

  const revealedPhotoIds = useMemo(
    () => new Set(photos.filter((p) => p.revealed).map((p) => p.id)),
    [photos],
  );

  const orderedPhotos = useMemo(
    () =>
      [...photos]
        .filter((p) => p.play_order !== null)
        .sort((a, b) => (a.play_order ?? 0) - (b.play_order ?? 0)),
    [photos],
  );

  const guessesByPhoto = useMemo(() => {
    const map = new Map<string, Guess[]>();
    for (const g of guesses) {
      const arr = map.get(g.photo_id) ?? [];
      arr.push(g);
      map.set(g.photo_id, arr);
    }
    return map;
  }, [guesses]);

  const photoStats: PhotoStat[] = useMemo(() => {
    return orderedPhotos.map((p) => {
      const photoGuesses = guessesByPhoto.get(p.id) ?? [];
      const uploaderName =
        (p.uploader_id && uploaderById.get(p.uploader_id)?.name) || '?';
      return {
        photo: p,
        uploaderName,
        correct: photoGuesses.filter((g) => g.is_correct).length,
        total: photoGuesses.length,
      };
    });
  }, [orderedPhotos, guessesByPhoto, uploaderById]);

  const winner = useMemo(() => {
    let best: { player: Player; score: number; name: string } | null = null;
    for (const p of players) {
      const score = guesses.filter(
        (g) =>
          g.player_id === p.id &&
          g.is_correct &&
          revealedPhotoIds.has(g.photo_id),
      ).length;
      const name = uploaderById.get(p.uploader_id)?.name ?? '?';
      if (!best || score > best.score) {
        best = { player: p, score, name };
      }
    }
    return best;
  }, [players, guesses, revealedPhotoIds, uploaderById]);

  // Easiest / hardest only meaningful when there were guesses.
  const scored = photoStats.filter((s) => s.total > 0);
  const easiest = scored.length
    ? scored.reduce((max, cur) => (cur.correct > max.correct ? cur : max))
    : null;
  const hardest = scored.length
    ? scored.reduce((min, cur) => (cur.correct < min.correct ? cur : min))
    : null;

  const totalGuesses = guesses.filter((g) => revealedPhotoIds.has(g.photo_id))
    .length;
  const totalCorrect = guesses.filter(
    (g) => g.is_correct && revealedPhotoIds.has(g.photo_id),
  ).length;

  return (
    <div className="space-y-6">
      {winner && winner.score > 0 ? (
        <div className="text-center space-y-1">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Winner
          </p>
          <p className="text-4xl font-bold">🏆 {winner.name}</p>
          <p className="text-sm text-slate-400">
            {winner.score} of {photoStats.length} correct
          </p>
        </div>
      ) : (
        players.length > 0 && (
          <p className="text-center text-slate-400 text-sm">
            No correct guesses this round.
          </p>
        )
      )}

      {players.length > 0 && (
        <Leaderboard
          players={players}
          uploaders={uploaders}
          guesses={guesses}
          revealedPhotoIds={revealedPhotoIds}
          highlightPlayerId={highlightPlayerId}
        />
      )}

      {(easiest || hardest) && totalGuesses > 0 && (
        <section className="rounded-lg bg-slate-900 border border-slate-800 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wider text-slate-500">
            Highlights
          </h3>
          <p className="text-sm text-slate-300">
            {totalCorrect} of {totalGuesses} guesses landed.
          </p>
          {easiest && (
            <div className="text-sm">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Easiest photo
              </p>
              <p>
                {easiest.uploaderName} — {easiest.correct}/{easiest.total} got
                it
              </p>
            </div>
          )}
          {hardest && hardest.photo.id !== easiest?.photo.id && (
            <div className="text-sm">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Hardest photo
              </p>
              <p>
                {hardest.uploaderName} — {hardest.correct}/{hardest.total} got
                it
              </p>
            </div>
          )}
        </section>
      )}

      {photoStats.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs uppercase tracking-wider text-slate-500">
            All photos
          </h3>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photoStats.map((s) => (
              <li
                key={s.photo.id}
                className="rounded-lg overflow-hidden bg-slate-900 border border-slate-800"
              >
                <div className="aspect-square">
                  <img
                    src={getPhotoPublicUrl(s.photo.storage_path)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="px-3 py-2 space-y-0.5 text-sm">
                  <p className="font-semibold truncate">{s.uploaderName}</p>
                  <p className="text-xs text-slate-400">
                    {s.total === 0
                      ? 'no guesses'
                      : `${s.correct}/${s.total} got it`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

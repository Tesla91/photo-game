import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  addPhoto,
  addUploader,
  getPhotoPublicUrl,
  getRoomByCode,
  listPhotosForUploader,
  uploadFileToStorage,
  type Photo,
  type Room,
} from '../lib/api';
import {
  getUploaderIdentity,
  setUploaderIdentity,
} from '../lib/identity';
import { getToken, setToken } from '../lib/tokens';
import { resizeImage } from '../lib/resize';

type Status =
  | 'loading'
  | 'need_name'
  | 'ready'
  | 'not_found'
  | 'not_open'
  | 'error';

export function Upload() {
  const { code: codeParam = '' } = useParams<{ code: string }>();
  const code = codeParam.toUpperCase();

  const [status, setStatus] = useState<Status>('loading');
  const [room, setRoom] = useState<Room | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [identityName, setIdentityName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busySlots, setBusySlots] = useState<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const r = await getRoomByCode(code);
      if (!r) {
        setStatus('not_found');
        return;
      }
      setRoom(r);

      if (r.state !== 'uploading') {
        setStatus('not_open');
        return;
      }

      const identity = getUploaderIdentity(code);
      if (!identity) {
        setStatus('need_name');
        return;
      }
      setIdentityName(identity.name);
      const ph = await listPhotosForUploader(identity.uploaderId);
      setPhotos(ph);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, [code]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submitName = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const { uploader_id, upload_token } = await addUploader(code, nameInput);
      setToken('upload', code, upload_token);
      setUploaderIdentity(code, {
        uploaderId: uploader_id,
        name: nameInput.trim(),
      });
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
        setError('That name is already taken in this room. Try another.');
      } else {
        setError(msg);
      }
    }
  };

  const handleFile = async (slotIndex: number, file: File) => {
    if (!room) return;
    const identity = getUploaderIdentity(code);
    const token = getToken('upload', code);
    if (!identity || !token) {
      setError('Your upload session has expired. Refresh and re-enter your name.');
      return;
    }

    setBusySlots((prev) => new Set(prev).add(slotIndex));
    setError(null);
    try {
      const resized = await resizeImage(file);
      const storagePath = await uploadFileToStorage(room.id, resized);
      await addPhoto(code, token, storagePath);
      const ph = await listPhotosForUploader(identity.uploaderId);
      setPhotos(ph);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusySlots((prev) => {
        const next = new Set(prev);
        next.delete(slotIndex);
        return next;
      });
    }
  };

  const onFileChange =
    (slotIndex: number) => (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) handleFile(slotIndex, file);
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

  if (status === 'not_open') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold">Uploads closed</h1>
          <p className="text-slate-400">The host has already started the game.</p>
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
        <p className="text-red-400">Couldn't load the room: {error}</p>
        <button
          onClick={refresh}
          className="text-indigo-400 hover:text-indigo-300"
        >
          Try again
        </button>
      </main>
    );
  }

  if (status === 'need_name') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <form onSubmit={submitName} className="w-full max-w-md space-y-6">
          <header className="space-y-2 text-center">
            <p className="text-sm text-slate-500 uppercase tracking-wider">
              Room {code}
            </p>
            <h1 className="text-3xl font-bold">What's your name?</h1>
            <p className="text-slate-400">
              Other players only see this after each photo's reveal.{' '}
              {room.photos_per_player} photo
              {room.photos_per_player === 1 ? '' : 's'} to upload.
            </p>
          </header>

          <label className="block space-y-2">
            <span className="text-sm text-slate-400">Your name</span>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              required
              autoFocus
              maxLength={40}
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
            disabled={!nameInput.trim()}
            className="w-full rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed py-3 font-semibold transition-colors"
          >
            Continue
          </button>
        </form>
      </main>
    );
  }

  const slots = Array.from({ length: room.photos_per_player }, (_, i) => i);
  const remaining = room.photos_per_player - photos.length;

  return (
    <main className="min-h-screen p-6 max-w-2xl mx-auto space-y-8">
      <header className="space-y-1">
        <p className="text-sm text-slate-500 uppercase tracking-wider">
          Room {code}
        </p>
        <h1 className="text-2xl font-bold">Uploading as {identityName}</h1>
        <p className="text-slate-400">
          {photos.length} of {room.photos_per_player} uploaded
        </p>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {slots.map((i) => {
          const photo = photos[i];
          const busy = busySlots.has(i);
          if (photo) {
            return (
              <div
                key={i}
                className="aspect-square rounded-lg overflow-hidden bg-slate-900 border border-slate-800"
              >
                <img
                  src={getPhotoPublicUrl(photo.storage_path)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            );
          }
          return (
            <label
              key={i}
              className={[
                'aspect-square rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors text-sm font-medium',
                busy
                  ? 'border-indigo-500 text-indigo-300 cursor-wait'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300',
              ].join(' ')}
            >
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={onFileChange(i)}
                disabled={busy}
              />
              <span>{busy ? 'Uploading…' : '+ Add photo'}</span>
            </label>
          );
        })}
      </section>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {remaining === 0 && (
        <div className="rounded-lg bg-emerald-900/30 border border-emerald-700/60 p-4 text-sm text-emerald-200 text-center">
          All your photos are in. Wait for the host to start the game.
        </div>
      )}
    </main>
  );
}

// Realtime subscription helpers. Each helper subscribes the caller to the
// Postgres-Changes events it cares about, returning a cleanup function
// that removes the channel — pair them with useEffect's cleanup slot.

import { supabase } from './supabase';
import type { Guess, Photo, Player, Room, RoomState, Uploader } from './api';

export type RoomUploadEvents = {
  onUploaderAdded: (u: Uploader) => void;
  onPhotoAdded: (p: Photo) => void;
  onPhotoRemoved: (id: string) => void;
};

export function subscribeRoomUploads(
  roomId: string,
  events: RoomUploadEvents,
): () => void {
  const channel = supabase
    .channel(`room-uploads:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'uploaders',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => events.onUploaderAdded(payload.new as Uploader),
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'photos',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => events.onPhotoAdded(payload.new as Photo),
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'photos',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => events.onPhotoRemoved((payload.old as Photo).id),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export type PlayerRoomEvents = {
  onRoomChanged: (room: { state: RoomState; current_photo_id: string | null }) => void;
  onPhotoUpdated: (photo: Photo) => void;
  onGuessAdded?: (guess: Guess) => void;
  onPlayerJoined?: (player: Player) => void;
};

export function subscribePlayerRoom(
  roomId: string,
  events: PlayerRoomEvents,
): () => void {
  let channel = supabase
    .channel(`player-room:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`,
      },
      (payload) => {
        const r = payload.new as Room;
        events.onRoomChanged({
          state: r.state,
          current_photo_id: r.current_photo_id,
        });
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'photos',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => events.onPhotoUpdated(payload.new as Photo),
    );

  if (events.onGuessAdded) {
    channel = channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'guesses',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => events.onGuessAdded!(payload.new as Guess),
    );
  }

  if (events.onPlayerJoined) {
    channel = channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'players',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => events.onPlayerJoined!(payload.new as Player),
    );
  }

  channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

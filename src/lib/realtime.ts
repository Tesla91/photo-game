// Realtime subscription helpers. Each helper subscribes the caller to the
// Postgres-Changes events it cares about, returning a cleanup function
// that removes the channel — pair them with useEffect's cleanup slot.

import { supabase } from './supabase';
import type { Photo, Uploader } from './api';

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

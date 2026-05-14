import { supabase } from './supabase';

export type RoomState = 'uploading' | 'in_game' | 'finished';

export type Room = {
  id: string;
  code: string;
  photos_per_player: number;
  state: RoomState;
  current_photo_id: string | null;
  created_at: string;
  expires_at: string;
};

export type Uploader = {
  id: string;
  room_id: string;
  name: string;
  created_at: string;
};

export type CreateRoomResult = {
  room_id: string;
  code: string;
  host_token: string;
};

export async function createRoom(photosPerPlayer: number): Promise<CreateRoomResult> {
  const { data, error } = await supabase.rpc('create_room', {
    p_photos_per_player: photosPerPlayer,
  });
  if (error) throw new Error(error.message);
  const row = (data as CreateRoomResult[] | null)?.[0];
  if (!row) throw new Error('create_room returned no row');
  return row;
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  const { data, error } = await supabase
    .from('rooms')
    .select('id, code, photos_per_player, state, current_photo_id, created_at, expires_at')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Room | null;
}

export async function listUploaders(roomId: string): Promise<Uploader[]> {
  const { data, error } = await supabase
    .from('uploaders')
    .select('id, room_id, name, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Uploader[];
}

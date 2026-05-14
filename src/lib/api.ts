import { supabase } from './supabase';

export type RoomState = 'uploading' | 'in_game' | 'finished';

export type Room = {
  id: string;
  code: string;
  photos_per_player: number;
  state: RoomState;
  current_photo_id: string | null;
  host_message: string | null;
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

export async function createRoom(
  photosPerPlayer: number,
  hostMessage?: string,
): Promise<CreateRoomResult> {
  const { data, error } = await supabase.rpc('create_room', {
    p_photos_per_player: photosPerPlayer,
    p_host_message: hostMessage?.trim() || null,
  });
  if (error) throw new Error(error.message);
  const row = (data as CreateRoomResult[] | null)?.[0];
  if (!row) throw new Error('create_room returned no row');
  return row;
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  const { data, error } = await supabase
    .from('rooms')
    .select(
      'id, code, photos_per_player, state, current_photo_id, host_message, created_at, expires_at',
    )
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

export type Photo = {
  id: string;
  room_id: string;
  uploader_id: string | null;
  storage_path: string;
  play_order: number | null;
  revealed: boolean;
  created_at: string;
};

export type AddUploaderResult = {
  uploader_id: string;
  upload_token: string;
};

export async function addUploader(
  roomCode: string,
  name: string,
): Promise<AddUploaderResult> {
  const { data, error } = await supabase.rpc('add_uploader', {
    p_room_code: roomCode.toUpperCase(),
    p_name: name.trim(),
  });
  if (error) throw new Error(error.message);
  const row = (data as AddUploaderResult[] | null)?.[0];
  if (!row) throw new Error('add_uploader returned no row');
  return row;
}

export async function addPhoto(
  roomCode: string,
  uploadToken: string,
  storagePath: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('add_photo', {
    p_room_code: roomCode.toUpperCase(),
    p_upload_token: uploadToken,
    p_storage_path: storagePath,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function listPhotosForRoom(roomId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, room_id, uploader_id, storage_path, play_order, revealed, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Photo[];
}

export async function listPhotosForUploader(uploaderId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, room_id, uploader_id, storage_path, play_order, revealed, created_at')
    .eq('uploader_id', uploaderId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Photo[];
}

export async function uploadFileToStorage(
  roomId: string,
  file: Blob,
): Promise<string> {
  const storagePath = `${roomId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from('room-photos')
    .upload(storagePath, file, {
      contentType: 'image/jpeg',
      upsert: false,
    });
  if (error) throw new Error(error.message);
  return storagePath;
}

export async function deletePhoto(
  roomCode: string,
  uploadToken: string,
  photoId: string,
): Promise<void> {
  const { error } = await supabase.rpc('delete_photo', {
    p_room_code: roomCode.toUpperCase(),
    p_upload_token: uploadToken,
    p_photo_id: photoId,
  });
  if (error) throw new Error(error.message);
}

export async function deleteStorageObject(storagePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from('room-photos')
    .remove([storagePath]);
  if (error) throw new Error(error.message);
}

export function getPhotoPublicUrl(storagePath: string): string {
  return supabase.storage.from('room-photos').getPublicUrl(storagePath).data
    .publicUrl;
}

// ---------- Game control (host) -------------------------------------------

export async function startGame(roomCode: string, hostToken: string): Promise<void> {
  const { error } = await supabase.rpc('start_game', {
    p_room_code: roomCode.toUpperCase(),
    p_host_token: hostToken,
  });
  if (error) throw new Error(error.message);
}

export async function nextPhoto(
  roomCode: string,
  hostToken: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('next_photo', {
    p_room_code: roomCode.toUpperCase(),
    p_host_token: hostToken,
  });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export async function revealCurrentPhoto(
  roomCode: string,
  hostToken: string,
): Promise<void> {
  const { error } = await supabase.rpc('reveal_current_photo', {
    p_room_code: roomCode.toUpperCase(),
    p_host_token: hostToken,
  });
  if (error) throw new Error(error.message);
}

// ---------- Game (player) -------------------------------------------------

export type JoinAsPlayerResult = {
  player_id: string;
  session_token: string;
};

export async function joinAsPlayer(
  roomCode: string,
  uploaderId: string,
): Promise<JoinAsPlayerResult> {
  const { data, error } = await supabase.rpc('join_as_player', {
    p_room_code: roomCode.toUpperCase(),
    p_uploader_id: uploaderId,
  });
  if (error) throw new Error(error.message);
  const row = (data as JoinAsPlayerResult[] | null)?.[0];
  if (!row) throw new Error('join_as_player returned no row');
  return row;
}

export type Player = {
  id: string;
  room_id: string;
  uploader_id: string;
  joined_at: string;
};

export type Guess = {
  id: string;
  room_id: string;
  photo_id: string;
  player_id: string;
  guessed_uploader_id: string;
  is_correct: boolean;
  submitted_at: string;
};

export async function listPlayersForRoom(roomId: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from('players')
    .select('id, room_id, uploader_id, joined_at')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Player[];
}

export async function listGuessesForRoom(roomId: string): Promise<Guess[]> {
  const { data, error } = await supabase
    .from('guesses')
    .select(
      'id, room_id, photo_id, player_id, guessed_uploader_id, is_correct, submitted_at',
    )
    .eq('room_id', roomId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Guess[];
}

export async function submitGuess(
  roomCode: string,
  sessionToken: string,
  photoId: string,
  guessedUploaderId: string,
): Promise<void> {
  const { error } = await supabase.rpc('submit_guess', {
    p_room_code: roomCode.toUpperCase(),
    p_session_token: sessionToken,
    p_photo_id: photoId,
    p_guessed_uploader_id: guessedUploaderId,
  });
  if (error) throw new Error(error.message);
}

// ---------- Admin / recovery ----------------------------------------------

export type AdminRoom = {
  id: string;
  code: string;
  state: RoomState;
  photos_per_player: number;
  host_message: string | null;
  uploader_count: number;
  photo_count: number;
  created_at: string;
  expires_at: string;
  host_token: string;
};

export async function adminListRooms(adminToken: string): Promise<AdminRoom[]> {
  const { data, error } = await supabase.rpc('admin_list_rooms', {
    p_admin_token: adminToken,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminRoom[];
}

export async function adminDeleteRoom(
  adminToken: string,
  roomId: string,
): Promise<void> {
  // admin_delete_room drops the DB rows (cascading from rooms) and returns
  // the storage paths it would otherwise have deleted. Supabase no longer
  // allows DELETE on storage.objects from SQL, so we follow up with the
  // Storage API here. If the second call fails the DB is still consistent;
  // the files just orphan until the next admin pass.
  const { data, error } = await supabase.rpc('admin_delete_room', {
    p_admin_token: adminToken,
    p_room_id: roomId,
  });
  if (error) throw new Error(error.message);

  const paths = (data ?? []) as string[];
  if (paths.length > 0) {
    const { error: storageErr } = await supabase.storage
      .from('room-photos')
      .remove(paths);
    if (storageErr) {
      console.warn('Storage cleanup failed:', storageErr.message);
    }
  }
}

export async function verifyHostToken(
  roomCode: string,
  hostToken: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('verify_host_token', {
    p_room_code: roomCode.toUpperCase(),
    p_host_token: hostToken,
  });
  if (error) throw new Error(error.message);
  return data as boolean;
}

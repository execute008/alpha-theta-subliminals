import { atom, map } from 'nanostores';
import type { Track } from './types';
import { createDefaultTrack } from './types';

// Track list store
export const tracks = atom<Track[]>([]);

// Selected track store
export const selectedTrack = atom<Track | null>(null);

// Track actions
export function addTrack(options: Partial<Track> = {}): Track {
  const track = createDefaultTrack(options);
  tracks.set([...tracks.get(), track]);
  selectedTrack.set(track);
  return track;
}

export function removeTrack(trackId: string): void {
  const currentTracks = tracks.get();
  const newTracks = currentTracks.filter(t => t.id !== trackId);
  tracks.set(newTracks);
  
  // Clear selection if removed track was selected
  if (selectedTrack.get()?.id === trackId) {
    selectedTrack.set(newTracks.length > 0 ? newTracks[0] : null);
  }
}

export function updateTrack(trackId: string, updates: Partial<Track>): void {
  const currentTracks = tracks.get();
  const newTracks = currentTracks.map(t => 
    t.id === trackId ? { ...t, ...updates } : t
  );
  tracks.set(newTracks);
  
  // Update selected track if it was the one updated
  const current = selectedTrack.get();
  if (current?.id === trackId) {
    selectedTrack.set({ ...current, ...updates });
  }
}

export function selectTrack(track: Track | null): void {
  selectedTrack.set(track);
}

export function toggleMute(trackId: string): void {
  const track = tracks.get().find(t => t.id === trackId);
  if (track) {
    updateTrack(trackId, { muted: !track.muted });
  }
}

export function toggleSolo(trackId: string): void {
  const track = tracks.get().find(t => t.id === trackId);
  if (track) {
    updateTrack(trackId, { solo: !track.solo });
  }
}

export function duplicateTrack(trackId: string): Track | null {
  const track = tracks.get().find(t => t.id === trackId);
  if (!track) return null;
  
  const newTrack = createDefaultTrack({
    ...track,
    id: undefined, // Generate new ID
    name: `${track.name} (Copy)`,
  });
  
  tracks.set([...tracks.get(), newTrack]);
  selectedTrack.set(newTrack);
  return newTrack;
}

export function getTrackById(trackId: string): Track | undefined {
  return tracks.get().find(t => t.id === trackId);
}

// Calculate max duration from all tracks
export function getMaxTrackDuration(): number {
  let maxDuration = 0;
  for (const track of tracks.get()) {
    if (track.buffer) {
      maxDuration = Math.max(maxDuration, track.buffer.duration);
    }
    // For multi-subliminal tracks, use the longest sentence
    if (track.type === 'multi-subliminal' && track.sentences) {
      for (const sentence of track.sentences) {
        if (sentence.buffer) {
          maxDuration = Math.max(maxDuration, sentence.buffer.duration);
        }
      }
    }
  }
  return maxDuration;
}

import { atom } from 'nanostores';
import type { PlaybackState } from './types';

// Playback state store
export const playbackState = atom<PlaybackState>({
  isPlaying: false,
  currentTime: 0,
  loop: false,
});

// Playback actions
export function setPlaying(playing: boolean): void {
  const current = playbackState.get();
  playbackState.set({ ...current, isPlaying: playing });
}

export function setCurrentTime(time: number): void {
  const current = playbackState.get();
  playbackState.set({ ...current, currentTime: time });
}

export function toggleLoop(): void {
  const current = playbackState.get();
  playbackState.set({ ...current, loop: !current.loop });
}

export function setLoop(loop: boolean): void {
  const current = playbackState.get();
  playbackState.set({ ...current, loop });
}

export function resetPlayback(): void {
  playbackState.set({
    isPlaying: false,
    currentTime: 0,
    loop: playbackState.get().loop,
  });
}

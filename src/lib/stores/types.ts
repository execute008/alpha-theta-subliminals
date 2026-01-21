// Type definitions for the application state

export type TrackType = 'audio' | 'subliminal' | 'multi-subliminal' | 'binaural' | 'ambient';

export interface RecordedSentence {
  text: string;
  buffer: AudioBuffer;
}

/**
 * Represents a single placement/instance of a track on the timeline.
 * Generated based on repetition settings and stored for both
 * timeline visualization and export consistency.
 */
export interface TrackPlacement {
  startTime: number;      // Start position in seconds
  endTime: number;        // End position (startTime + duration/pitchShift)
  volume: number;         // Volume multiplier (1.0 = track volume, or randomized)
  pitchShift: number;     // Pitch multiplier (1.0 = normal, or randomized ±5%)
  pan: number;            // Stereo pan position (-1 to 1)
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  buffer: AudioBuffer | null;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  
  // Subliminal-specific settings
  repetitionsPerHour: number;
  randomizePosition: boolean;
  randomizeVolume: boolean;
  randomizePitch: boolean;
  
  // Multi-sentence subliminal settings
  sentences: RecordedSentence[];
  minVolume: number;  // 1% - scientific subliminal threshold
  maxVolume: number;  // 15% - upper limit for subliminal
  minLayers: number;  // Minimum simultaneous sentences
  maxLayers: number;  // Maximum simultaneous sentences
  
  // Effects
  fadeIn: number;
  fadeOut: number;
  
  // Binaural-specific settings
  binauralFrequency: number;
  baseFrequency: number;
  
  // Pre-computed placements for timeline visualization and export
  placements: TrackPlacement[];
  
  // UI elements (set at runtime)
  element?: HTMLElement | null;
  canvas?: HTMLCanvasElement | null;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  loop: boolean;
}

export interface AppSettings {
  outputDuration: number;  // in seconds
  outputFormat: 'wav' | 'mp3';
  masterVolume: number;
  selectedWaveType: 'theta' | 'alpha';
  binauralFrequency: number;
  baseFrequency: number;
}

export interface RecordingState {
  mode: 'single' | 'multi';
  isRecording: boolean;
  isInSession: boolean;
  sentenceList: string[];
  currentSentenceIndex: number;
  recordedSentences: RecordedSentence[];
  recordingStartTime: number | null;
}

export function createDefaultTrack(options: Partial<Track> = {}): Track {
  return {
    id: options.id || `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: options.name || 'New Track',
    type: options.type || 'audio',
    buffer: options.buffer || null,
    volume: options.volume ?? 1,
    pan: options.pan ?? 0,
    muted: options.muted ?? false,
    solo: options.solo ?? false,
    
    repetitionsPerHour: options.repetitionsPerHour ?? 60,
    randomizePosition: options.randomizePosition ?? true,
    randomizeVolume: options.randomizeVolume ?? true,
    randomizePitch: options.randomizePitch ?? true,
    
    sentences: options.sentences || [],
    minVolume: options.minVolume ?? 0.01,
    maxVolume: options.maxVolume ?? 0.15,
    minLayers: options.minLayers ?? 2,
    maxLayers: options.maxLayers ?? 4,
    
    fadeIn: options.fadeIn ?? 0,
    fadeOut: options.fadeOut ?? 0,
    
    binauralFrequency: options.binauralFrequency ?? 6,
    baseFrequency: options.baseFrequency ?? 200,
    
    placements: options.placements || [],
    
    element: null,
    canvas: null,
  };
}

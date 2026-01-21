import { atom } from 'nanostores';
import type { AppSettings, RecordingState } from './types';

// App settings store
export const appSettings = atom<AppSettings>({
  outputDuration: 3600, // Default 1 hour (in seconds)
  outputFormat: 'wav',
  masterVolume: 0.8,
  selectedWaveType: 'theta',
  binauralFrequency: 6,
  baseFrequency: 200,
});

// Recording state store
export const recordingState = atom<RecordingState>({
  mode: 'single',
  isRecording: false,
  isInSession: false,
  sentenceList: [],
  currentSentenceIndex: 0,
  recordedSentences: [],
  recordingStartTime: null,
});

// Settings actions
export function setOutputDuration(duration: number): void {
  const current = appSettings.get();
  appSettings.set({ ...current, outputDuration: duration });
}

export function setOutputFormat(format: 'wav' | 'mp3'): void {
  const current = appSettings.get();
  appSettings.set({ ...current, outputFormat: format });
}

export function setMasterVolume(volume: number): void {
  const current = appSettings.get();
  appSettings.set({ ...current, masterVolume: Math.max(0, Math.min(1, volume)) });
}

export function setWaveType(type: 'theta' | 'alpha'): void {
  const current = appSettings.get();
  let freq = current.binauralFrequency;
  
  // Adjust frequency range based on wave type
  if (type === 'theta') {
    freq = Math.max(4, Math.min(8, freq));
    if (freq < 4 || freq > 8) freq = 6;
  } else {
    freq = Math.max(8, Math.min(13, freq));
    if (freq < 8 || freq > 13) freq = 10;
  }
  
  appSettings.set({ ...current, selectedWaveType: type, binauralFrequency: freq });
}

export function setBinauralFrequency(frequency: number): void {
  const current = appSettings.get();
  appSettings.set({ ...current, binauralFrequency: frequency });
}

export function setBaseFrequency(frequency: number): void {
  const current = appSettings.get();
  appSettings.set({ ...current, baseFrequency: frequency });
}

// Recording state actions
export function setRecordingMode(mode: 'single' | 'multi'): void {
  const current = recordingState.get();
  recordingState.set({ ...current, mode });
}

export function startRecording(): void {
  const current = recordingState.get();
  recordingState.set({ 
    ...current, 
    isRecording: true,
    recordingStartTime: Date.now()
  });
}

export function stopRecording(): void {
  const current = recordingState.get();
  recordingState.set({ 
    ...current, 
    isRecording: false,
    recordingStartTime: null
  });
}

export function startSentenceSession(sentences: string[]): void {
  recordingState.set({
    mode: 'multi',
    isRecording: false,
    isInSession: true,
    sentenceList: sentences,
    currentSentenceIndex: 0,
    recordedSentences: [],
    recordingStartTime: null,
  });
}

export function advanceToNextSentence(): void {
  const current = recordingState.get();
  recordingState.set({
    ...current,
    currentSentenceIndex: current.currentSentenceIndex + 1,
  });
}

export function addRecordedSentence(text: string, buffer: AudioBuffer): void {
  const current = recordingState.get();
  recordingState.set({
    ...current,
    recordedSentences: [...current.recordedSentences, { text, buffer }],
  });
}

export function resetSentenceSession(): void {
  recordingState.set({
    mode: recordingState.get().mode,
    isRecording: false,
    isInSession: false,
    sentenceList: [],
    currentSentenceIndex: 0,
    recordedSentences: [],
    recordingStartTime: null,
  });
}

export function reRecordCurrentSentence(): void {
  const current = recordingState.get();
  const currentText = current.sentenceList[current.currentSentenceIndex];
  
  // Remove the last recorded sentence if it matches the current one
  const newRecorded = current.recordedSentences.filter(
    s => s.text !== currentText
  );
  
  recordingState.set({
    ...current,
    recordedSentences: newRecorded,
  });
}

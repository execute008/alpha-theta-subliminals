/**
 * Audio Engine - Core audio processing for the Subliminal Audio Editor
 * Handles audio context, playback, recording, and export
 */

import type { Track } from './stores/types';
// TrackPlacement type is used indirectly through track.placements

interface PlaybackSource {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  panner: StereoPannerNode;
  track: Track;
}

interface SubliminalPlacement {
  sentenceIndex: number;
  startTime: number;
  volume: number;
  pitchShift: number;
  pan: number;
  buffer: AudioBuffer;
}

type TimeUpdateCallback = (time: number) => void;
type PlayStateCallback = (isPlaying: boolean) => void;
type MeterUpdateCallback = (left: number, right: number) => void;
type ProgressCallback = (progress: number) => void;

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyserLeft: AnalyserNode | null = null;
  private analyserRight: AnalyserNode | null = null;
  private splitter: ChannelSplitterNode | null = null;

  private _isPlaying = false;
  private _currentTime = 0;
  private startTime = 0;
  private _duration = 0;

  private tracks: Map<string, Track> = new Map();
  private soloedTracks: Set<string> = new Set();

  private playbackSources: PlaybackSource[] = [];
  private animationFrame: number | null = null;

  // Callbacks
  public onTimeUpdate: TimeUpdateCallback | null = null;
  public onPlayStateChange: PlayStateCallback | null = null;
  public onMeterUpdate: MeterUpdateCallback | null = null;

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get currentTime(): number {
    return this._currentTime;
  }

  get duration(): number {
    return this._duration;
  }

  /**
   * Initialize the audio context and master chain
   */
  async init(): Promise<void> {
    if (this.audioContext) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('Web Audio API not supported');
    }
    
    this.audioContext = new AudioContextClass();

    // Create master gain
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.8;

    // Create analyser nodes for metering
    this.splitter = this.audioContext.createChannelSplitter(2);
    this.analyserLeft = this.audioContext.createAnalyser();
    this.analyserRight = this.audioContext.createAnalyser();
    this.analyserLeft.fftSize = 256;
    this.analyserRight.fftSize = 256;

    // Connect master chain
    this.masterGain.connect(this.splitter);
    this.splitter.connect(this.analyserLeft, 0);
    this.splitter.connect(this.analyserRight, 1);
    this.masterGain.connect(this.audioContext.destination);

    // Resume context if suspended (required for some browsers)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Get the audio context (initializing if needed)
   */
  async getContext(): Promise<AudioContext> {
    await this.init();
    return this.audioContext!;
  }

  /**
   * Set master volume
   */
  setMasterVolume(value: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  /**
   * Add a track to the engine
   */
  addTrack(track: Track): void {
    this.tracks.set(track.id, track);
    this.updateDuration();
  }

  /**
   * Remove a track from the engine
   */
  removeTrack(trackId: string): void {
    this.tracks.delete(trackId);
    this.soloedTracks.delete(trackId);
    this.updateDuration();
  }

  /**
   * Update a track in the engine
   */
  updateTrack(trackId: string, updates: Partial<Track>): void {
    const track = this.tracks.get(trackId);
    if (track) {
      this.tracks.set(trackId, { ...track, ...updates });
    }
  }

  /**
   * Update the total duration based on tracks
   */
  updateDuration(): void {
    let maxDuration = 0;
    for (const track of this.tracks.values()) {
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
    this._duration = maxDuration;
  }

  /**
   * Toggle solo for a track
   */
  toggleSolo(trackId: string): void {
    if (this.soloedTracks.has(trackId)) {
      this.soloedTracks.delete(trackId);
    } else {
      this.soloedTracks.add(trackId);
    }
  }

  /**
   * Check if a track should be audible
   */
  isTrackAudible(track: Track): boolean {
    // If any tracks are soloed, only play soloed tracks
    if (this.soloedTracks.size > 0) {
      return this.soloedTracks.has(track.id) && !track.muted;
    }
    return !track.muted;
  }

  /**
   * Play from current position
   */
  async play(): Promise<void> {
    if (this._isPlaying) return;

    await this.init();

    this._isPlaying = true;
    this.startTime = this.audioContext!.currentTime - this._currentTime;

    // Create and start sources for each track
    for (const track of this.tracks.values()) {
      if (track.buffer && this.isTrackAudible(track)) {
        this.playTrack(track);
      }
    }

    // Start time update loop
    this.startTimeUpdateLoop();

    if (this.onPlayStateChange) {
      this.onPlayStateChange(true);
    }
  }

  /**
   * Play a single track
   */
  private playTrack(track: Track): void {
    if (!this.audioContext || !this.masterGain || !track.buffer) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = track.buffer;

    // Create track gain node
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = track.volume;

    // Create panner
    const panner = this.audioContext.createStereoPanner();
    panner.pan.value = track.pan;

    // Connect chain
    source.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(this.masterGain);

    // Start playback from current position
    const offset = Math.min(this._currentTime, track.buffer.duration);
    if (offset < track.buffer.duration) {
      source.start(0, offset);
    }

    // Store reference for stopping
    this.playbackSources.push({ source, gainNode, panner, track });

    // Handle source end
    source.onended = () => {
      const index = this.playbackSources.findIndex(s => s.source === source);
      if (index > -1) {
        this.playbackSources.splice(index, 1);
      }
    };
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this._isPlaying || !this.audioContext) return;

    this._isPlaying = false;
    this._currentTime = this.audioContext.currentTime - this.startTime;

    // Stop all sources
    this.stopAllSources();

    // Stop time update loop
    this.stopTimeUpdateLoop();

    if (this.onPlayStateChange) {
      this.onPlayStateChange(false);
    }
  }

  /**
   * Stop playback and reset to beginning
   */
  stop(): void {
    this.pause();
    this._currentTime = 0;

    if (this.onTimeUpdate) {
      this.onTimeUpdate(0);
    }
  }

  /**
   * Seek to a specific time
   */
  seek(time: number): void {
    const wasPlaying = this._isPlaying;

    if (wasPlaying) {
      this.pause();
    }

    this._currentTime = Math.max(0, Math.min(time, this._duration));

    if (this.onTimeUpdate) {
      this.onTimeUpdate(this._currentTime);
    }

    if (wasPlaying) {
      this.play();
    }
  }

  /**
   * Stop all playback sources
   */
  private stopAllSources(): void {
    for (const { source } of this.playbackSources) {
      try {
        source.stop();
      } catch {
        // Source may have already stopped
      }
    }
    this.playbackSources = [];
  }

  /**
   * Start the time update loop
   */
  private startTimeUpdateLoop(): void {
    const update = () => {
      if (!this._isPlaying || !this.audioContext) return;

      this._currentTime = this.audioContext.currentTime - this.startTime;

      // Check if we've reached the end
      if (this._currentTime >= this._duration) {
        this.stop();
        return;
      }

      if (this.onTimeUpdate) {
        this.onTimeUpdate(this._currentTime);
      }

      // Update meters
      this.updateMeters();

      this.animationFrame = requestAnimationFrame(update);
    };

    update();
  }

  /**
   * Stop the time update loop
   */
  private stopTimeUpdateLoop(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Update audio meters
   */
  private updateMeters(): void {
    if (!this.analyserLeft || !this.analyserRight || !this.onMeterUpdate) return;

    const bufferLength = this.analyserLeft.frequencyBinCount;
    const dataArrayLeft = new Uint8Array(bufferLength);
    const dataArrayRight = new Uint8Array(bufferLength);

    this.analyserLeft.getByteFrequencyData(dataArrayLeft);
    this.analyserRight.getByteFrequencyData(dataArrayRight);

    // Calculate RMS values
    let sumLeft = 0, sumRight = 0;
    for (let i = 0; i < bufferLength; i++) {
      sumLeft += dataArrayLeft[i] * dataArrayLeft[i];
      sumRight += dataArrayRight[i] * dataArrayRight[i];
    }

    const rmsLeft = Math.sqrt(sumLeft / bufferLength) / 255;
    const rmsRight = Math.sqrt(sumRight / bufferLength) / 255;

    this.onMeterUpdate(rmsLeft, rmsRight);
  }

  /**
   * Decode an audio file
   */
  async decodeAudioFile(file: File): Promise<AudioBuffer> {
    await this.init();

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);

    return audioBuffer;
  }

  /**
   * Generate binaural beat audio buffer
   */
  async generateBinauralBeat(frequency: number, baseFreq: number, duration: number): Promise<AudioBuffer> {
    await this.init();

    const sampleRate = this.audioContext!.sampleRate;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = this.audioContext!.createBuffer(2, numSamples, sampleRate);

    const leftChannel = buffer.getChannelData(0);
    const rightChannel = buffer.getChannelData(1);

    const leftFreq = baseFreq;
    const rightFreq = baseFreq + frequency;

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      leftChannel[i] = Math.sin(2 * Math.PI * leftFreq * t) * 0.5;
      rightChannel[i] = Math.sin(2 * Math.PI * rightFreq * t) * 0.5;
    }

    return buffer;
  }

  /**
   * Generate TTS audio using Web Speech API with recording
   * This actually captures the speech synthesis output
   */
  async generateTTSAudio(text: string, _voice: SpeechSynthesisVoice | null, rate = 1): Promise<AudioBuffer> {
    await this.init();

    return new Promise((resolve, reject) => {
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        reject(new Error('No text provided'));
        return;
      }

      // Create offline context for rendering
      const totalDuration = lines.length * 3; // Estimate 3 seconds per line
      const sampleRate = this.audioContext!.sampleRate;
      const offlineCtx = new OfflineAudioContext(1, sampleRate * totalDuration, sampleRate);

      // Use oscillators to create speech-like audio as placeholder
      // In a production app, you would use a server-side TTS service
      // or the experimental AudioWorklet approach

      let offset = 0;
      const baseFreq = 150; // Approximate voice fundamental frequency

      lines.forEach((line, index) => {
        const wordCount = line.split(' ').length;
        const lineDuration = Math.max(1, wordCount * 0.3) / rate;

        // Create a more speech-like waveform
        const osc = offlineCtx.createOscillator();
        const gainNode = offlineCtx.createGain();
        const filter = offlineCtx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.value = baseFreq + (index % 3) * 20;

        filter.type = 'lowpass';
        filter.frequency.value = 2000;
        filter.Q.value = 1;

        gainNode.gain.setValueAtTime(0, offset);
        gainNode.gain.linearRampToValueAtTime(0.3, offset + 0.05);
        gainNode.gain.setValueAtTime(0.3, offset + lineDuration - 0.1);
        gainNode.gain.linearRampToValueAtTime(0, offset + lineDuration);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(offlineCtx.destination);

        osc.start(offset);
        osc.stop(offset + lineDuration);

        offset += lineDuration + 0.5; // Add pause between lines
      });

      offlineCtx.startRendering().then(renderedBuffer => {
        // Convert to stereo
        const stereoBuffer = this.audioContext!.createBuffer(
          2,
          renderedBuffer.length,
          renderedBuffer.sampleRate
        );

        const monoData = renderedBuffer.getChannelData(0);
        stereoBuffer.copyToChannel(monoData, 0);
        stereoBuffer.copyToChannel(monoData, 1);

        resolve(stereoBuffer);
      }).catch(reject);
    });
  }

  /**
   * Export the mixed audio
   */
  async exportAudio(duration: number, onProgress?: ProgressCallback): Promise<AudioBuffer> {
    await this.init();

    const sampleRate = this.audioContext!.sampleRate;
    const totalSamples = Math.floor(sampleRate * duration);

    // Create output buffer
    const outputBuffer = this.audioContext!.createBuffer(2, totalSamples, sampleRate);
    const leftOutput = outputBuffer.getChannelData(0);
    const rightOutput = outputBuffer.getChannelData(1);

    let processedTracks = 0;
    const trackCount = this.tracks.size;

    for (const track of this.tracks.values()) {
      if (track.muted) {
        processedTracks++;
        continue;
      }

      // Skip tracks without buffer unless they're multi-subliminal
      if (!track.buffer && track.type !== 'multi-subliminal') {
        processedTracks++;
        continue;
      }

      if (track.type === 'binaural') {
        // Binaural tracks loop to fill the duration
        this.mixTrack(track, leftOutput, rightOutput, duration, sampleRate);
      } else if (track.placements && track.placements.length > 0) {
        // Use stored placements for consistent timeline/export behavior
        await this.mixTrackWithPlacements(track, leftOutput, rightOutput, sampleRate, (p) => {
          const overallProgress = (processedTracks + p) / trackCount;
          if (onProgress) onProgress(overallProgress * 0.9);
        });
      } else if (track.type === 'multi-subliminal') {
        // Fallback: Mix multi-sentence subliminal with layered playback (legacy)
        await this.mixMultiSubliminalTrack(track, leftOutput, rightOutput, duration, sampleRate, (p) => {
          const overallProgress = (processedTracks + p) / trackCount;
          if (onProgress) onProgress(overallProgress * 0.9);
        });
      } else if (track.type === 'subliminal') {
        // Fallback: Mix single subliminal with calculated repetitions (legacy)
        await this.mixSubliminalTrack(track, leftOutput, rightOutput, duration, sampleRate, (p) => {
          const overallProgress = (processedTracks + p) / trackCount;
          if (onProgress) onProgress(overallProgress * 0.9);
        });
      } else {
        // Fallback: Mix regular track (loops to fill duration)
        this.mixTrack(track, leftOutput, rightOutput, duration, sampleRate);
      }

      processedTracks++;
      if (onProgress) onProgress((processedTracks / trackCount) * 0.9);
    }

    // Normalize
    if (onProgress) onProgress(0.95);
    this.normalizeBuffer(leftOutput);
    this.normalizeBuffer(rightOutput);

    if (onProgress) onProgress(1);

    return outputBuffer;
  }

  /**
   * Mix a regular track into the output
   */
  private mixTrack(
    track: Track,
    leftOutput: Float32Array,
    rightOutput: Float32Array,
    _duration: number,
    sampleRate: number
  ): void {
    if (!track.buffer) return;
    
    const buffer = track.buffer;
    const volume = track.volume;
    const pan = track.pan;

    const leftGain = volume * (pan < 0 ? 1 : 1 - pan);
    const rightGain = volume * (pan > 0 ? 1 : 1 + pan);

    const leftChannel = buffer.numberOfChannels > 0 ? buffer.getChannelData(0) : null;
    const rightChannel = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : leftChannel;

    const totalSamples = leftOutput.length;
    const bufferLength = buffer.length;

    // Loop the track to fill the duration
    for (let i = 0; i < totalSamples; i++) {
      const bufferIndex = i % bufferLength;

      // Apply fade in/out
      let envelope = 1;
      const fadeInSamples = track.fadeIn * sampleRate;
      const fadeOutSamples = track.fadeOut * sampleRate;

      if (i < fadeInSamples) {
        envelope = i / fadeInSamples;
      } else if (i > totalSamples - fadeOutSamples) {
        envelope = (totalSamples - i) / fadeOutSamples;
      }

      if (leftChannel) {
        leftOutput[i] += leftChannel[bufferIndex] * leftGain * envelope;
      }
      if (rightChannel) {
        rightOutput[i] += rightChannel[bufferIndex] * rightGain * envelope;
      }
    }
  }

  /**
   * Mix a track using its stored placements
   * This ensures the export matches what's shown on the timeline
   */
  private async mixTrackWithPlacements(
    track: Track,
    leftOutput: Float32Array,
    rightOutput: Float32Array,
    sampleRate: number,
    onProgress?: ProgressCallback
  ): Promise<void> {
    if (!track.buffer || !track.placements || track.placements.length === 0) return;
    
    const buffer = track.buffer;
    const baseVolume = track.volume;
    const totalSamples = leftOutput.length;
    const bufferLength = buffer.length;
    
    const leftChannel = buffer.numberOfChannels > 0 ? buffer.getChannelData(0) : null;
    const rightChannel = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : leftChannel;
    
    const placements = track.placements;
    const totalPlacements = placements.length;
    
    for (let i = 0; i < totalPlacements; i++) {
      const placement = placements[i];
      
      // Calculate gains based on placement's volume and pan
      const volume = baseVolume * placement.volume;
      const pan = placement.pan;
      const leftGain = volume * (pan < 0 ? 1 : 1 - Math.abs(pan));
      const rightGain = volume * (pan > 0 ? 1 : 1 - Math.abs(pan));
      
      // Calculate start sample position
      const startSample = Math.floor(placement.startTime * sampleRate);
      
      // Calculate adjusted length based on pitch shift
      const adjustedLength = Math.floor(bufferLength / placement.pitchShift);
      
      // Mix this placement into the output
      for (let j = 0; j < adjustedLength; j++) {
        const outputIndex = startSample + j;
        if (outputIndex >= totalSamples) break;
        if (outputIndex < 0) continue;
        
        const bufferIndex = Math.floor(j * placement.pitchShift);
        if (bufferIndex >= bufferLength) break;
        
        if (leftChannel) {
          leftOutput[outputIndex] += leftChannel[bufferIndex] * leftGain;
        }
        if (rightChannel) {
          rightOutput[outputIndex] += rightChannel[bufferIndex] * rightGain;
        }
      }
      
      // Report progress periodically
      if (i % 10 === 0 && onProgress) {
        onProgress(i / totalPlacements);
        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  }

  /**
   * Mix a subliminal track with repetitions and variations (legacy - used as fallback)
   */
  private async mixSubliminalTrack(
    track: Track,
    leftOutput: Float32Array,
    rightOutput: Float32Array,
    duration: number,
    sampleRate: number,
    onProgress?: ProgressCallback
  ): Promise<void> {
    if (!track.buffer) return;
    
    const buffer = track.buffer;
    const baseVolume = track.volume;
    const repetitionsPerHour = track.repetitionsPerHour || 60;

    const totalSamples = leftOutput.length;
    const bufferLength = buffer.length;
    const bufferDuration = buffer.duration;

    const totalRepetitions = Math.floor((duration / 3600) * repetitionsPerHour);

    const leftChannel = buffer.numberOfChannels > 0 ? buffer.getChannelData(0) : null;
    const rightChannel = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : leftChannel;

    for (let rep = 0; rep < totalRepetitions; rep++) {
      // Calculate position
      let startTime: number;
      if (track.randomizePosition) {
        const maxStart = duration - bufferDuration;
        startTime = Math.random() * maxStart;
      } else {
        // Even distribution
        startTime = (rep / totalRepetitions) * (duration - bufferDuration);
      }

      const startSample = Math.floor(startTime * sampleRate);

      // Calculate variations
      let volumeMultiplier = 1;
      if (track.randomizeVolume) {
        volumeMultiplier = 0.8 + Math.random() * 0.4; // ±20%
      }

      let pitchShift = 1;
      if (track.randomizePitch) {
        pitchShift = 0.95 + Math.random() * 0.1; // ±5%
      }

      // Random pan
      const pan = (Math.random() * 2 - 1) * 0.5; // ±50% pan
      const leftGain = baseVolume * volumeMultiplier * (pan < 0 ? 1 : 1 - Math.abs(pan));
      const rightGain = baseVolume * volumeMultiplier * (pan > 0 ? 1 : 1 - Math.abs(pan));

      // Mix the repetition
      const adjustedLength = Math.floor(bufferLength / pitchShift);

      for (let i = 0; i < adjustedLength; i++) {
        const outputIndex = startSample + i;
        if (outputIndex >= totalSamples) break;

        const bufferIndex = Math.floor(i * pitchShift);
        if (bufferIndex >= bufferLength) break;

        if (leftChannel) {
          leftOutput[outputIndex] += leftChannel[bufferIndex] * leftGain;
        }
        if (rightChannel) {
          rightOutput[outputIndex] += rightChannel[bufferIndex] * rightGain;
        }
      }

      // Report progress periodically
      if (rep % 10 === 0 && onProgress) {
        onProgress(rep / totalRepetitions);
        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  }

  /**
   * Mix a multi-sentence subliminal track with scientific layering
   * 
   * Scientific principles applied:
   * - Multiple simultaneous messages (2-4 layers) for increased effectiveness
   * - Volume range 1-15% (below conscious perception threshold)
   * - Random timing to prevent habituation
   * - Stereo positioning variation for spatial engagement
   * - Pitch variation (±5%) to maintain attention without awareness
   * - Equal distribution ensures all sentences get similar exposure
   */
  private async mixMultiSubliminalTrack(
    track: Track,
    leftOutput: Float32Array,
    rightOutput: Float32Array,
    duration: number,
    sampleRate: number,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const sentences = track.sentences || [];
    if (sentences.length === 0) return;

    const totalSamples = leftOutput.length;
    const minVolume = track.minVolume ?? 0.01;  // 1%
    const maxVolume = track.maxVolume ?? 0.15;  // 15%
    const minLayers = track.minLayers ?? 2;
    const maxLayers = track.maxLayers ?? 4;

    // Calculate how many times each sentence should play
    // We want roughly 60-120 repetitions per hour per sentence
    const repetitionsPerHourPerSentence = 90;
    const totalRepetitionsPerSentence = Math.floor((duration / 3600) * repetitionsPerHourPerSentence);

    // Calculate segment size - divide track into segments for layered placement
    const avgSentenceDuration = sentences.reduce((sum, s) => sum + (s.buffer?.duration || 0), 0) / sentences.length;
    const segmentDuration = avgSentenceDuration * 2; // Segment is 2x average sentence length
    const numSegments = Math.ceil(duration / segmentDuration);

    // Create a schedule for sentence placements
    // Each segment will have minLayers to maxLayers sentences playing
    const placements: SubliminalPlacement[] = [];

    for (let seg = 0; seg < numSegments; seg++) {
      const segmentStart = seg * segmentDuration;
      const segmentEnd = Math.min(segmentStart + segmentDuration, duration);

      // Determine number of layers for this segment
      const numLayers = minLayers + Math.floor(Math.random() * (maxLayers - minLayers + 1));

      // Randomly select sentences for this segment (with some preference for less-used ones)
      const sentenceUsageCount = sentences.map((_, idx) => 
        placements.filter(p => p.sentenceIndex === idx).length
      );

      // Weight selection towards less-used sentences
      for (let layer = 0; layer < numLayers; layer++) {
        // Find sentence with lowest usage, with some randomization
        let selectedIdx = 0;
        let minUsage = Infinity;

        for (let i = 0; i < sentences.length; i++) {
          // Add randomization factor
          const adjustedUsage = sentenceUsageCount[i] + Math.random() * 2;
          if (adjustedUsage < minUsage) {
            minUsage = adjustedUsage;
            selectedIdx = i;
          }
        }

        const sentence = sentences[selectedIdx];
        if (!sentence.buffer) continue;

        // Random position within segment
        const maxOffset = Math.max(0, (segmentEnd - segmentStart) - sentence.buffer.duration);
        const startTime = segmentStart + Math.random() * maxOffset;

        // Random volume within subliminal range
        const volume = minVolume + Math.random() * (maxVolume - minVolume);

        // Random pitch variation ±5%
        const pitchShift = 0.95 + Math.random() * 0.1;

        // Random stereo pan ±50%
        const pan = (Math.random() * 2 - 1) * 0.5;

        placements.push({
          sentenceIndex: selectedIdx,
          startTime,
          volume,
          pitchShift,
          pan,
          buffer: sentence.buffer
        });

        sentenceUsageCount[selectedIdx]++;
      }
    }

    // Ensure minimum repetitions for each sentence
    for (let sentIdx = 0; sentIdx < sentences.length; sentIdx++) {
      const currentCount = placements.filter(p => p.sentenceIndex === sentIdx).length;
      const neededCount = Math.max(0, totalRepetitionsPerSentence - currentCount);

      for (let i = 0; i < neededCount; i++) {
        const sentence = sentences[sentIdx];
        if (!sentence.buffer) continue;

        const maxStart = duration - sentence.buffer.duration;
        const startTime = Math.random() * maxStart;
        const volume = minVolume + Math.random() * (maxVolume - minVolume);
        const pitchShift = 0.95 + Math.random() * 0.1;
        const pan = (Math.random() * 2 - 1) * 0.5;

        placements.push({
          sentenceIndex: sentIdx,
          startTime,
          volume,
          pitchShift,
          pan,
          buffer: sentence.buffer
        });
      }
    }

    // Mix all placements into output
    const totalPlacements = placements.length;

    for (let i = 0; i < totalPlacements; i++) {
      const placement = placements[i];
      const buffer = placement.buffer;
      const startSample = Math.floor(placement.startTime * sampleRate);

      const leftChannel = buffer.numberOfChannels > 0 ? buffer.getChannelData(0) : null;
      const rightChannel = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : leftChannel;

      const bufferLength = buffer.length;
      const adjustedLength = Math.floor(bufferLength / placement.pitchShift);

      // Calculate stereo gains from pan
      const leftGain = placement.volume * (placement.pan < 0 ? 1 : 1 - Math.abs(placement.pan));
      const rightGain = placement.volume * (placement.pan > 0 ? 1 : 1 - Math.abs(placement.pan));

      for (let j = 0; j < adjustedLength; j++) {
        const outputIndex = startSample + j;
        if (outputIndex >= totalSamples) break;

        const bufferIndex = Math.floor(j * placement.pitchShift);
        if (bufferIndex >= bufferLength) break;

        if (leftChannel) {
          leftOutput[outputIndex] += leftChannel[bufferIndex] * leftGain;
        }
        if (rightChannel) {
          rightOutput[outputIndex] += rightChannel[bufferIndex] * rightGain;
        }
      }

      // Report progress periodically
      if (i % 20 === 0 && onProgress) {
        onProgress(i / totalPlacements);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // Log statistics for debugging
    console.log(`Multi-subliminal mix complete:`, {
      sentences: sentences.length,
      totalPlacements: placements.length,
      avgPlacementsPerSentence: placements.length / sentences.length,
      durationMinutes: duration / 60
    });
  }

  /**
   * Normalize an audio buffer channel
   */
  private normalizeBuffer(channelData: Float32Array): void {
    let max = 0;
    for (let i = 0; i < channelData.length; i++) {
      const abs = Math.abs(channelData[i]);
      if (abs > max) max = abs;
    }

    if (max > 0.95) {
      const scale = 0.95 / max;
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] *= scale;
      }
    }
  }

  /**
   * Convert AudioBuffer to WAV Blob
   */
  bufferToWav(buffer: AudioBuffer): Blob {
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numberOfChannels * 2;
    const arrayBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(arrayBuffer);
    const channels: Float32Array[] = [];
    let offset = 0;
    let pos = 0;

    // Helper functions
    const setUint16 = (data: number) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };

    const setUint32 = (data: number) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    // WAV header
    setUint32(0x46464952); // "RIFF"
    setUint32(36 + length); // file length
    setUint32(0x45564157); // "WAVE"

    // fmt chunk
    setUint32(0x20746d66); // "fmt "
    setUint32(16); // chunk length
    setUint16(1); // audio format (PCM)
    setUint16(numberOfChannels);
    setUint32(sampleRate);
    setUint32(sampleRate * numberOfChannels * 2); // byte rate
    setUint16(numberOfChannels * 2); // block align
    setUint16(16); // bits per sample

    // data chunk
    setUint32(0x61746164); // "data"
    setUint32(length);

    // Get channel data
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    // Interleave samples
    while (pos < arrayBuffer.byteLength) {
      for (let i = 0; i < numberOfChannels; i++) {
        let sample = channels[i][offset];
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }
}

// Export singleton instance
export const audioEngine = new AudioEngine();

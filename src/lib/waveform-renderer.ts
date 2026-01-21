/**
 * Waveform Renderer - Handles waveform visualization for audio tracks
 */

import type { RecordedSentence, TrackPlacement } from './stores/types';

interface WaveformPeaks {
  min: Float32Array;
  max: Float32Array;
}

interface WaveformRenderOptions {
  color?: string;
  backgroundColor?: string;
  zoom?: number;
  scrollOffset?: number;
  playheadPosition?: number | null;
  playheadColor?: string;
  timelineDuration?: number; // Total timeline duration in seconds
}

interface MultiSubliminalRenderOptions {
  color?: string;
  backgroundColor?: string;
  zoom?: number;
  scrollOffset?: number;
  timelineDuration?: number;
}

interface BinauralRenderOptions {
  color?: string;
  backgroundColor?: string;
}

interface PlacementsRenderOptions {
  color?: string;
  backgroundColor?: string;
  zoom?: number;
  scrollOffset?: number;
  playheadPosition?: number | null;
  playheadColor?: string;
  timelineDuration?: number;
}

interface TimeRulerRenderOptions {
  zoom?: number;
  scrollOffset?: number;
  playheadPosition?: number | null;
  backgroundColor?: string;
  textColor?: string;
  lineColor?: string;
  playheadColor?: string;
}

export class WaveformRenderer {
  private cache: Map<string, WaveformPeaks> = new Map();

  /**
   * Analyze an audio buffer and extract waveform data
   */
  analyzeBuffer(buffer: AudioBuffer, samplesPerPixel = 1000): WaveformPeaks {
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const numPoints = Math.ceil(length / samplesPerPixel);

    const peaks: WaveformPeaks = {
      min: new Float32Array(numPoints),
      max: new Float32Array(numPoints)
    };

    // Process each channel and combine
    for (let channel = 0; channel < channels; channel++) {
      const data = buffer.getChannelData(channel);

      for (let i = 0; i < numPoints; i++) {
        const start = i * samplesPerPixel;
        const end = Math.min(start + samplesPerPixel, length);

        let min = Infinity;
        let max = -Infinity;

        for (let j = start; j < end; j++) {
          const sample = data[j];
          if (sample < min) min = sample;
          if (sample > max) max = sample;
        }

        // Average across channels
        if (channel === 0) {
          peaks.min[i] = min;
          peaks.max[i] = max;
        } else {
          peaks.min[i] = (peaks.min[i] + min) / 2;
          peaks.max[i] = (peaks.max[i] + max) / 2;
        }
      }
    }

    return peaks;
  }

  /**
   * Render waveform to a canvas
   */
  render(canvas: HTMLCanvasElement, buffer: AudioBuffer | null, options: WaveformRenderOptions = {}): void {
    const {
      color = '#58a6ff',
      backgroundColor = 'transparent',
      zoom = 1,
      scrollOffset = 0,
      playheadPosition = null,
      playheadColor = '#f85149',
      timelineDuration = 0
    } = options;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = canvas;

    // Clear canvas
    if (backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    if (!buffer) return;

    const bufferDuration = buffer.duration;
    const totalDuration = timelineDuration > 0 ? timelineDuration : bufferDuration;
    
    // Calculate what portion of the canvas width the buffer should occupy
    const bufferWidthRatio = bufferDuration / totalDuration;
    const bufferPixelWidth = width * bufferWidthRatio * zoom;
    
    // Calculate samples per pixel for the buffer's portion
    const samplesPerPixel = Math.max(1, Math.floor(buffer.length / bufferPixelWidth));

    // Get or create cached waveform data
    const cacheKey = `${buffer.length}-${samplesPerPixel}`;
    let peaks: WaveformPeaks;

    if (this.cache.has(cacheKey)) {
      peaks = this.cache.get(cacheKey)!;
    } else {
      peaks = this.analyzeBuffer(buffer, samplesPerPixel);
      this.cache.set(cacheKey, peaks);
    }

    // Calculate visible time range based on scroll
    const visibleStartTime = scrollOffset * totalDuration;

    // Draw waveform
    const centerY = height / 2;
    const amplitude = height / 2 - 2;

    ctx.fillStyle = color;
    ctx.beginPath();

    let started = false;
    
    // Top half - draw only the portion of the waveform that's visible
    for (let canvasX = 0; canvasX < width; canvasX++) {
      // Convert canvas position to time
      const timeAtPixel = visibleStartTime + (canvasX / width) * (totalDuration / zoom);
      
      // Check if this time is within the buffer duration
      if (timeAtPixel < 0 || timeAtPixel >= bufferDuration) {
        if (started) {
          // If we were drawing and now we're outside, move to center
          ctx.lineTo(canvasX, centerY);
        }
        continue;
      }
      
      // Convert time to buffer sample position
      const bufferPosition = timeAtPixel / bufferDuration;
      const peakIndex = Math.floor(bufferPosition * peaks.max.length);
      
      if (peakIndex >= peaks.max.length) continue;

      const y = centerY - peaks.max[peakIndex] * amplitude;
      if (!started) {
        ctx.moveTo(canvasX, y);
        started = true;
      } else {
        ctx.lineTo(canvasX, y);
      }
    }

    // Bottom half (reverse)
    for (let canvasX = width - 1; canvasX >= 0; canvasX--) {
      const timeAtPixel = visibleStartTime + (canvasX / width) * (totalDuration / zoom);
      
      if (timeAtPixel < 0 || timeAtPixel >= bufferDuration) continue;
      
      const bufferPosition = timeAtPixel / bufferDuration;
      const peakIndex = Math.floor(bufferPosition * peaks.min.length);
      
      if (peakIndex >= peaks.min.length) continue;

      const y = centerY - peaks.min[peakIndex] * amplitude;
      ctx.lineTo(canvasX, y);
    }

    ctx.closePath();
    ctx.fill();

    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Draw playhead if specified
    if (playheadPosition !== null && playheadPosition >= 0) {
      const playheadX = (playheadPosition / totalDuration - scrollOffset) * zoom * width;

      if (playheadX >= 0 && playheadX <= width) {
        ctx.fillStyle = playheadColor;
        ctx.fillRect(playheadX - 1, 0, 2, height);
      }
    }
  }

  /**
   * Render waveform with placements - shows each placement instance on the timeline
   * This displays the track repeated at each of its placement positions
   */
  renderWithPlacements(
    canvas: HTMLCanvasElement,
    buffer: AudioBuffer | null,
    placements: TrackPlacement[],
    options: PlacementsRenderOptions = {}
  ): void {
    const {
      color = '#58a6ff',
      backgroundColor = 'transparent',
      zoom = 1,
      scrollOffset = 0,
      playheadPosition = null,
      playheadColor = '#f85149',
      timelineDuration = 3600
    } = options;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = canvas;

    // Clear canvas
    if (backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    const centerY = height / 2;

    if (!buffer || placements.length === 0) {
      // Draw center line even if no content
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();
      return;
    }
    const amplitude = height / 2 - 2;
    const bufferDuration = buffer.duration;

    // Calculate visible time range
    const visibleStartTime = scrollOffset * timelineDuration;
    const visibleDuration = timelineDuration / zoom;
    const visibleEndTime = visibleStartTime + visibleDuration;

    // Get or create cached waveform peaks
    const samplesPerPixel = Math.max(1, Math.floor(buffer.length / 500)); // Use fixed resolution for cache efficiency
    const cacheKey = `${buffer.length}-${samplesPerPixel}`;
    let peaks: WaveformPeaks;

    if (this.cache.has(cacheKey)) {
      peaks = this.cache.get(cacheKey)!;
    } else {
      peaks = this.analyzeBuffer(buffer, samplesPerPixel);
      this.cache.set(cacheKey, peaks);
    }

    // Draw each placement
    for (const placement of placements) {
      // Calculate placement duration (accounting for pitch shift)
      const placementDuration = bufferDuration / placement.pitchShift;
      const placementEnd = placement.startTime + placementDuration;

      // Skip placements outside visible range
      if (placementEnd < visibleStartTime || placement.startTime > visibleEndTime) {
        continue;
      }

      // Calculate pixel positions for this placement
      const placementStartPixel = ((placement.startTime - visibleStartTime) / visibleDuration) * width;
      const placementEndPixel = ((placementEnd - visibleStartTime) / visibleDuration) * width;
      const placementWidth = placementEndPixel - placementStartPixel;

      // Skip if too small to render
      if (placementWidth < 1) continue;

      // Use volume to adjust opacity (lower volume = more transparent)
      const volumeOpacity = Math.max(0.3, Math.min(1, placement.volume));
      
      ctx.globalAlpha = volumeOpacity;
      ctx.fillStyle = color;
      ctx.beginPath();

      // Draw waveform for this placement
      let started = false;
      
      // Top half
      for (let px = Math.max(0, Math.floor(placementStartPixel)); px < Math.min(width, Math.ceil(placementEndPixel)); px++) {
        // Calculate time relative to placement start
        const pixelTime = visibleStartTime + (px / width) * visibleDuration;
        const relativeTime = pixelTime - placement.startTime;
        
        // Skip if outside this placement
        if (relativeTime < 0 || relativeTime >= placementDuration) {
          if (started) {
            ctx.lineTo(px, centerY);
          }
          continue;
        }

        // Map to buffer position (accounting for pitch shift)
        const bufferTime = relativeTime * placement.pitchShift;
        const bufferPosition = bufferTime / bufferDuration;
        const peakIndex = Math.min(Math.floor(bufferPosition * peaks.max.length), peaks.max.length - 1);

        const y = centerY - peaks.max[peakIndex] * amplitude;
        if (!started) {
          ctx.moveTo(px, y);
          started = true;
        } else {
          ctx.lineTo(px, y);
        }
      }

      // Bottom half (reverse)
      for (let px = Math.min(width - 1, Math.ceil(placementEndPixel) - 1); px >= Math.max(0, Math.floor(placementStartPixel)); px--) {
        const pixelTime = visibleStartTime + (px / width) * visibleDuration;
        const relativeTime = pixelTime - placement.startTime;
        
        if (relativeTime < 0 || relativeTime >= placementDuration) continue;

        const bufferTime = relativeTime * placement.pitchShift;
        const bufferPosition = bufferTime / bufferDuration;
        const peakIndex = Math.min(Math.floor(bufferPosition * peaks.min.length), peaks.min.length - 1);

        const y = centerY - peaks.min[peakIndex] * amplitude;
        ctx.lineTo(px, y);
      }

      ctx.closePath();
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Draw playhead if specified
    if (playheadPosition !== null && playheadPosition >= 0) {
      const playheadX = ((playheadPosition - visibleStartTime) / visibleDuration) * width;

      if (playheadX >= 0 && playheadX <= width) {
        ctx.fillStyle = playheadColor;
        ctx.fillRect(playheadX - 1, 0, 2, height);
      }
    }
  }

  /**
   * Render multi-subliminal visualization (layered pattern)
   */
  renderMultiSubliminal(
    canvas: HTMLCanvasElement, 
    sentences: RecordedSentence[], 
    options: MultiSubliminalRenderOptions = {}
  ): void {
    const {
      color = '#06b6d4',
      backgroundColor = 'transparent',
    } = options;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = canvas;

    // Clear canvas
    if (backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    const centerY = height / 2;
    const layerHeight = height / (sentences.length + 1);

    // Draw layered wave representation
    sentences.forEach((sentence, idx) => {
      if (!sentence.buffer) return;

      const yOffset = centerY + (idx - sentences.length / 2) * (layerHeight / 2);
      const alpha = 0.3 + (0.4 / sentences.length);

      // Draw a stylized mini-waveform for each sentence
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (let x = 0; x < width; x++) {
        // Create varied wave pattern based on sentence index
        const t = (x / width) * Math.PI * 8;
        const wave = Math.sin(t + idx * 0.5) * Math.sin(t * 0.3 + idx);
        const y = yOffset + wave * (layerHeight / 3);

        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    });

    ctx.globalAlpha = 1;

    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Draw info label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px sans-serif';
    ctx.fillText(`${sentences.length} subliminal layers`, 8, 14);
    ctx.fillText(`2-4 playing simultaneously`, 8, 26);
  }

  /**
   * Render a binaural beat visualization (sine wave pattern)
   */
  renderBinaural(
    canvas: HTMLCanvasElement, 
    frequency: number, 
    baseFreq: number, 
    options: BinauralRenderOptions = {}
  ): void {
    const {
      color = '#a855f7',
      backgroundColor = 'transparent'
    } = options;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = canvas;

    // Clear canvas
    if (backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }

    const centerY = height / 2;
    const amplitude = height / 3;

    // Draw beat pattern (interference pattern)
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let x = 0; x < width; x++) {
      // Create interference pattern representing the binaural beat
      const t = x / width * 10 * Math.PI;
      const beat = Math.sin(frequency * t / 10);
      const carrier = Math.sin(t * 2);
      const y = centerY + (carrier * beat) * amplitude;

      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Draw frequency labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px sans-serif';
    ctx.fillText(`L: ${baseFreq}Hz`, 8, 14);
    ctx.fillText(`R: ${baseFreq + frequency}Hz`, 8, 26);
    ctx.fillText(`Beat: ${frequency}Hz`, 8, height - 8);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Time Ruler Renderer - Renders the time ruler at the top of the timeline
 */
export class TimeRulerRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2D context');
    this.ctx = ctx;
  }

  /**
   * Render the time ruler
   */
  render(duration: number, options: TimeRulerRenderOptions = {}): void {
    const {
      zoom = 1,
      scrollOffset = 0,
      playheadPosition = null,
      backgroundColor = '#161b22',
      textColor = '#8b949e',
      lineColor = '#30363d',
      playheadColor = '#f85149'
    } = options;

    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // Clear
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    if (duration <= 0) return;

    // Calculate visible time range
    const visibleDuration = duration / zoom;
    const startTime = scrollOffset * duration;
    const endTime = startTime + visibleDuration;

    // Determine interval based on zoom level
    let interval = 1; // seconds
    const pixelsPerSecond = width / visibleDuration;

    if (pixelsPerSecond < 2) interval = 60; // minutes
    else if (pixelsPerSecond < 10) interval = 30;
    else if (pixelsPerSecond < 20) interval = 10;
    else if (pixelsPerSecond < 50) interval = 5;
    else if (pixelsPerSecond < 100) interval = 1;
    else interval = 0.5;

    // Draw tick marks and labels
    ctx.fillStyle = textColor;
    ctx.font = '10px sans-serif';
    ctx.strokeStyle = lineColor;

    const startInterval = Math.floor(startTime / interval) * interval;

    for (let time = startInterval; time <= endTime; time += interval) {
      const x = ((time - startTime) / visibleDuration) * width;

      if (x < 0 || x > width) continue;

      // Draw tick
      ctx.beginPath();
      ctx.moveTo(x, height - 8);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Draw label
      const label = this.formatTime(time);
      const textWidth = ctx.measureText(label).width;
      ctx.fillText(label, x - textWidth / 2, height - 12);

      // Draw minor ticks
      const minorInterval = interval / 4;
      for (let minor = time + minorInterval; minor < time + interval; minor += minorInterval) {
        const minorX = ((minor - startTime) / visibleDuration) * width;
        if (minorX >= 0 && minorX <= width) {
          ctx.beginPath();
          ctx.moveTo(minorX, height - 4);
          ctx.lineTo(minorX, height);
          ctx.stroke();
        }
      }
    }

    // Draw playhead marker
    if (playheadPosition !== null && playheadPosition >= startTime && playheadPosition <= endTime) {
      const x = ((playheadPosition - startTime) / visibleDuration) * width;
      ctx.fillStyle = playheadColor;

      // Draw triangle
      ctx.beginPath();
      ctx.moveTo(x - 5, 0);
      ctx.lineTo(x + 5, 0);
      ctx.lineTo(x, 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * Format time as MM:SS or HH:MM:SS
   */
  formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }
}

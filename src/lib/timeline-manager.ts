/**
 * Timeline Manager - Manages timeline UI, track rendering, zoom/scroll
 */

import type { Track } from './stores/types';
import { WaveformRenderer, TimeRulerRenderer } from './waveform-renderer';
import { audioEngine } from './audio-engine';
import { tracks, selectedTrack, selectTrack, toggleMute, toggleSolo, updateTrack } from './stores/tracks';
import { appSettings } from './stores/settings';

export class TimelineManager {
  private tracksContainer: HTMLElement | null = null;
  private emptyTimeline: HTMLElement | null = null;
  private timeRulerCanvas: HTMLCanvasElement | null = null;
  private scrollbarThumb: HTMLElement | null = null;
  
  private waveformRenderer: WaveformRenderer;
  private timeRulerRenderer: TimeRulerRenderer | null = null;
  
  private _zoom = 1;
  private _scrollOffset = 0;
  private _duration = 3600; // Default to 1 hour - will sync with settings
  
  // Callbacks
  public onTrackSelect: ((track: Track | null) => void) | null = null;
  public onTracksChange: ((tracks: Track[]) => void) | null = null;

  constructor() {
    this.waveformRenderer = new WaveformRenderer();
  }

  get zoom(): number {
    return this._zoom;
  }

  get scrollOffset(): number {
    return this._scrollOffset;
  }

  get duration(): number {
    return this._duration;
  }

  /**
   * Initialize the timeline
   */
  init(): void {
    this.tracksContainer = document.getElementById('timelineTracks');
    this.emptyTimeline = document.getElementById('emptyTimeline');
    this.timeRulerCanvas = document.getElementById('timeRuler') as HTMLCanvasElement;
    this.scrollbarThumb = document.getElementById('scrollbarThumb');

    if (this.timeRulerCanvas) {
      this.timeRulerRenderer = new TimeRulerRenderer(this.timeRulerCanvas);
    }

    // Subscribe to settings changes to sync duration
    appSettings.subscribe(settings => {
      this.setDuration(settings.outputDuration);
    });

    // Subscribe to track changes
    tracks.subscribe(trackList => {
      this.render();
      if (this.onTracksChange) {
        this.onTracksChange(trackList);
      }
    });

    // Set up resize handling
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());

    // Set up scrollbar
    this.initScrollbar();

    // Set up horizontal scrolling with mouse wheel
    this.initWheelScroll();

    // Initial render
    this.render();
  }

  /**
   * Set the timeline duration (called when outputDuration changes)
   */
  setDuration(duration: number): void {
    this._duration = duration;
    this.renderTimeRuler();
    this.updateScrollbar();
    this.renderAllWaveforms();
  }

  /**
   * Handle window resize
   */
  handleResize(): void {
    if (this.timeRulerCanvas) {
      const container = this.timeRulerCanvas.parentElement;
      if (container) {
        this.timeRulerCanvas.width = container.clientWidth;
        this.timeRulerCanvas.height = container.clientHeight;
      }
    }

    this.renderTimeRuler();
    this.renderAllWaveforms();
  }

  /**
   * Initialize horizontal wheel scrolling
   */
  private initWheelScroll(): void {
    if (!this.tracksContainer) return;

    this.tracksContainer.addEventListener('wheel', (e) => {
      // Allow horizontal scrolling with shift+wheel or trackpad horizontal
      if (e.deltaX !== 0 || e.shiftKey) {
        e.preventDefault();
        const scrollDelta = (e.deltaX || e.deltaY) / 1000;
        this._scrollOffset = Math.max(0, Math.min(1 - 1 / this._zoom, this._scrollOffset + scrollDelta));
        this.updateScrollbar();
        this.renderTimeRuler();
        this.renderAllWaveforms();
      }
    }, { passive: false });
  }

  /**
   * Initialize scrollbar
   */
  private initScrollbar(): void {
    if (!this.scrollbarThumb) return;

    let isDragging = false;
    let startX: number;
    let startOffset: number;

    this.scrollbarThumb.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startOffset = this._scrollOffset;
      document.body.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging || !this.scrollbarThumb) return;

      const track = this.scrollbarThumb.parentElement;
      if (!track) return;

      const deltaX = e.clientX - startX;
      const deltaPercent = deltaX / track.clientWidth;

      this._scrollOffset = Math.max(0, Math.min(1 - 1 / this._zoom, startOffset + deltaPercent));
      this.updateScrollbar();
      this.renderTimeRuler();
      this.renderAllWaveforms();
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      document.body.style.cursor = '';
    });

    this.updateScrollbar();
  }

  /**
   * Update scrollbar thumb position and size
   */
  updateScrollbar(): void {
    if (!this.scrollbarThumb) return;

    const thumbWidth = Math.max(40, 100 / this._zoom);
    const thumbPosition = this._scrollOffset * (100 - thumbWidth);

    this.scrollbarThumb.style.width = `${thumbWidth}%`;
    this.scrollbarThumb.style.left = `${thumbPosition}%`;
  }

  /**
   * Zoom in
   */
  zoomIn(): void {
    this.setZoom(this._zoom * 1.5);
  }

  /**
   * Zoom out
   */
  zoomOut(): void {
    this.setZoom(this._zoom / 1.5);
  }

  /**
   * Fit to window
   */
  zoomFit(): void {
    this.setZoom(1);
    this._scrollOffset = 0;
  }

  /**
   * Set zoom level
   */
  setZoom(zoom: number): void {
    this._zoom = Math.max(1, Math.min(100, zoom));
    this._scrollOffset = Math.max(0, Math.min(1 - 1 / this._zoom, this._scrollOffset));
    
    this.updateScrollbar();
    this.renderTimeRuler();
    this.renderAllWaveforms();
  }

  /**
   * Render the timeline
   */
  render(): void {
    const trackList = tracks.get();
    
    // Show/hide empty state
    if (this.emptyTimeline) {
      this.emptyTimeline.classList.toggle('hidden', trackList.length > 0);
    }

    // Clear existing tracks (except empty state)
    if (this.tracksContainer) {
      const existingRows = this.tracksContainer.querySelectorAll('.track-row');
      existingRows.forEach(row => row.remove());

      // Render each track
      trackList.forEach(track => this.renderTrack(track));
    }

    // Render time ruler
    this.renderTimeRuler();
  }

  /**
   * Render a single track
   */
  private renderTrack(track: Track): void {
    if (!this.tracksContainer) return;

    const currentSelected = selectedTrack.get();
    const row = document.createElement('div');
    row.className = 'track-row';
    row.dataset.trackId = track.id;

    if (currentSelected?.id === track.id) {
      row.classList.add('selected');
    }

    // Determine color class
    let colorClass = 'audio';
    if (track.type === 'subliminal') colorClass = 'subliminal';
    else if (track.type === 'multi-subliminal') colorClass = 'multi-subliminal';
    else if (track.type === 'binaural') colorClass = 'binaural';
    else if (track.type === 'ambient') colorClass = 'ambient';

    row.innerHTML = `
      <div class="track-header">
        <div class="track-header-top">
          <div class="track-color ${colorClass}"></div>
          <span class="track-name">${track.name}</span>
        </div>
        <div class="track-controls">
          <button class="track-control-btn mute-btn ${track.muted ? 'active' : ''}" title="Mute">M</button>
          <button class="track-control-btn solo-btn ${track.solo ? 'active' : ''}" title="Solo">S</button>
        </div>
        <div class="track-volume-container">
          <input type="range" class="track-volume-slider" min="0" max="1" step="0.01" value="${track.volume}">
          <span class="track-volume-value">${Math.round(track.volume * 100)}%</span>
        </div>
      </div>
      <div class="track-waveform-container">
        <canvas class="track-waveform"></canvas>
      </div>
    `;

    // Store references
    const canvas = row.querySelector('.track-waveform') as HTMLCanvasElement;

    this.tracksContainer.appendChild(row);

    // Set canvas size after adding to DOM
    setTimeout(() => {
      const container = row.querySelector('.track-waveform-container') as HTMLElement;
      if (container && canvas) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        this.renderTrackWaveform(track, canvas);
      }
    }, 0);

    // Event listeners
    row.addEventListener('click', () => {
      selectTrack(track);
      if (this.onTrackSelect) {
        this.onTrackSelect(track);
      }
      // Update selection UI
      this.tracksContainer?.querySelectorAll('.track-row').forEach(r => {
        r.classList.toggle('selected', r.dataset.trackId === track.id);
      });
    });

    const muteBtn = row.querySelector('.mute-btn');
    muteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMute(track.id);
      muteBtn.classList.toggle('active');
    });

    const soloBtn = row.querySelector('.solo-btn');
    soloBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSolo(track.id);
      audioEngine.toggleSolo(track.id);
      soloBtn.classList.toggle('active');
    });

    const volumeSlider = row.querySelector('.track-volume-slider') as HTMLInputElement;
    const volumeValue = row.querySelector('.track-volume-value') as HTMLElement;
    
    volumeSlider?.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      updateTrack(track.id, { volume: value });
      if (volumeValue) {
        volumeValue.textContent = `${Math.round(value * 100)}%`;
      }
    });

    volumeSlider?.addEventListener('click', (e) => e.stopPropagation());
  }

  /**
   * Render waveform for a track
   */
  private renderTrackWaveform(track: Track, canvas: HTMLCanvasElement): void {
    // Determine color based on track type
    let color = '#8b949e';
    if (track.type === 'subliminal') color = '#3b82f6';
    else if (track.type === 'multi-subliminal') color = '#06b6d4';
    else if (track.type === 'binaural') color = '#a855f7';
    else if (track.type === 'ambient') color = '#10b981';
    else if (track.type === 'audio') color = '#22c55e';

    if (track.type === 'binaural') {
      // Binaural tracks fill the entire timeline
      this.waveformRenderer.renderBinaural(
        canvas,
        track.binauralFrequency,
        track.baseFrequency,
        { color }
      );
    } else if (track.placements && track.placements.length > 0) {
      // Render with placements for tracks that have them
      this.waveformRenderer.renderWithPlacements(
        canvas,
        track.buffer,
        track.placements,
        {
          color,
          zoom: this._zoom,
          scrollOffset: this._scrollOffset,
          playheadPosition: audioEngine.currentTime,
          timelineDuration: this._duration
        }
      );
    } else if (track.type === 'multi-subliminal' && track.sentences?.length > 0) {
      // Fallback for multi-subliminal without placements (legacy)
      this.waveformRenderer.renderMultiSubliminal(
        canvas,
        track.sentences,
        {
          color,
          zoom: this._zoom,
          scrollOffset: this._scrollOffset,
          timelineDuration: this._duration
        }
      );
    } else if (track.buffer) {
      // Fallback: render single waveform at start (for tracks without placements)
      this.waveformRenderer.render(
        canvas,
        track.buffer,
        {
          color,
          zoom: this._zoom,
          scrollOffset: this._scrollOffset,
          playheadPosition: audioEngine.currentTime,
          timelineDuration: this._duration
        }
      );
    }
  }

  /**
   * Render all track waveforms
   */
  renderAllWaveforms(): void {
    const trackList = tracks.get();
    trackList.forEach(track => {
      const row = this.tracksContainer?.querySelector(`[data-track-id="${track.id}"]`);
      const canvas = row?.querySelector('.track-waveform') as HTMLCanvasElement;
      if (canvas) {
        this.renderTrackWaveform(track, canvas);
      }
    });
  }

  /**
   * Render the time ruler
   */
  renderTimeRuler(): void {
    if (!this.timeRulerRenderer) return;

    this.timeRulerRenderer.render(this._duration, {
      zoom: this._zoom,
      scrollOffset: this._scrollOffset,
      playheadPosition: audioEngine.currentTime
    });
  }

  /**
   * Update playhead position
   */
  updatePlayhead(time: number): void {
    this.renderTimeRuler();
    this.renderAllWaveforms();
  }
}

// Export singleton instance
export const timelineManager = new TimelineManager();

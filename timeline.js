/**
 * Timeline Manager - Manages tracks and timeline UI
 */

class Track {
    constructor(options = {}) {
        this.id = options.id || `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.name = options.name || 'New Track';
        this.type = options.type || 'audio'; // audio, subliminal, binaural, ambient
        this.buffer = options.buffer || null;
        this.volume = options.volume ?? 1;
        this.pan = options.pan ?? 0;
        this.muted = options.muted ?? false;
        this.solo = options.solo ?? false;

        // Subliminal-specific settings
        this.repetitionsPerHour = options.repetitionsPerHour ?? 60;
        this.randomizePosition = options.randomizePosition ?? true;
        this.randomizeVolume = options.randomizeVolume ?? true;
        this.randomizePitch = options.randomizePitch ?? true;

        // Effects
        this.fadeIn = options.fadeIn ?? 0;
        this.fadeOut = options.fadeOut ?? 0;

        // Binaural-specific settings
        this.binauralFrequency = options.binauralFrequency ?? 6;
        this.baseFrequency = options.baseFrequency ?? 200;

        // UI elements
        this.element = null;
        this.canvas = null;
    }
}

class Timeline {
    constructor() {
        this.tracks = [];
        this.selectedTrack = null;
        this.zoom = 1;
        this.scrollOffset = 0;
        this.duration = 60; // Default 1 minute

        this.waveformRenderer = new WaveformRenderer();
        this.timeRulerRenderer = null;

        this.onTrackSelect = null;
        this.onTracksChange = null;
    }

    /**
     * Initialize the timeline
     */
    init() {
        this.tracksContainer = document.getElementById('timelineTracks');
        this.emptyTimeline = document.getElementById('emptyTimeline');
        this.timeRulerCanvas = document.getElementById('timeRuler');
        this.scrollbarThumb = document.getElementById('scrollbarThumb');

        // Initialize time ruler renderer
        this.timeRulerRenderer = new TimeRulerRenderer(this.timeRulerCanvas);

        // Set up resize handling
        this.handleResize();
        window.addEventListener('resize', () => this.handleResize());

        // Set up scrollbar
        this.initScrollbar();

        // Initial render
        this.render();
    }

    /**
     * Handle window resize
     */
    handleResize() {
        // Resize time ruler canvas
        const container = this.timeRulerCanvas.parentElement;
        this.timeRulerCanvas.width = container.clientWidth;
        this.timeRulerCanvas.height = container.clientHeight;

        // Re-render
        this.renderTimeRuler();
        this.renderAllWaveforms();
    }

    /**
     * Initialize scrollbar
     */
    initScrollbar() {
        let isDragging = false;
        let startX, startOffset;

        this.scrollbarThumb.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startOffset = this.scrollOffset;
            document.body.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const track = this.scrollbarThumb.parentElement;
            const deltaX = e.clientX - startX;
            const deltaPercent = deltaX / track.clientWidth;

            this.scrollOffset = Math.max(0, Math.min(1 - 1/this.zoom, startOffset + deltaPercent));
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
    updateScrollbar() {
        const thumbWidth = Math.max(40, 100 / this.zoom);
        const thumbPosition = this.scrollOffset * (100 - thumbWidth);

        this.scrollbarThumb.style.width = `${thumbWidth}%`;
        this.scrollbarThumb.style.left = `${thumbPosition}%`;
    }

    /**
     * Add a track
     */
    addTrack(track) {
        this.tracks.push(track);
        audioEngine.addTrack(track);

        // Update duration based on track
        if (track.buffer) {
            this.duration = Math.max(this.duration, track.buffer.duration);
        }

        this.render();

        if (this.onTracksChange) {
            this.onTracksChange(this.tracks);
        }

        // Select the new track
        this.selectTrack(track);

        return track;
    }

    /**
     * Remove a track
     */
    removeTrack(trackId) {
        const index = this.tracks.findIndex(t => t.id === trackId);
        if (index > -1) {
            this.tracks.splice(index, 1);
            audioEngine.removeTrack(trackId);

            if (this.selectedTrack?.id === trackId) {
                this.selectedTrack = null;
                if (this.onTrackSelect) {
                    this.onTrackSelect(null);
                }
            }

            this.render();

            if (this.onTracksChange) {
                this.onTracksChange(this.tracks);
            }
        }
    }

    /**
     * Duplicate a track
     */
    duplicateTrack(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return null;

        const newTrack = new Track({
            ...track,
            id: undefined, // Generate new ID
            name: `${track.name} (Copy)`
        });

        return this.addTrack(newTrack);
    }

    /**
     * Select a track
     */
    selectTrack(track) {
        this.selectedTrack = track;

        // Update UI
        this.tracks.forEach(t => {
            if (t.element) {
                t.element.classList.toggle('selected', t.id === track?.id);
            }
        });

        if (this.onTrackSelect) {
            this.onTrackSelect(track);
        }
    }

    /**
     * Update a track's properties
     */
    updateTrack(trackId, updates) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;

        Object.assign(track, updates);

        // Update name display if changed
        if (updates.name && track.element) {
            const nameEl = track.element.querySelector('.track-name');
            if (nameEl) nameEl.textContent = updates.name;
        }

        // Update volume display if changed
        if (updates.volume !== undefined && track.element) {
            const volumeSlider = track.element.querySelector('.track-volume-slider');
            const volumeValue = track.element.querySelector('.track-volume-value');
            if (volumeSlider) volumeSlider.value = updates.volume;
            if (volumeValue) volumeValue.textContent = `${Math.round(updates.volume * 100)}%`;
        }

        // Re-render waveform if binaural settings changed
        if ((updates.binauralFrequency !== undefined || updates.baseFrequency !== undefined) &&
            track.type === 'binaural') {
            this.renderTrackWaveform(track);
        }
    }

    /**
     * Toggle mute on a track
     */
    toggleMute(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.muted = !track.muted;

            // Update UI
            const muteBtn = track.element?.querySelector('.mute-btn');
            if (muteBtn) {
                muteBtn.classList.toggle('active', track.muted);
            }
        }
    }

    /**
     * Toggle solo on a track
     */
    toggleSolo(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.solo = !track.solo;
            audioEngine.toggleSolo(trackId);

            // Update UI
            const soloBtn = track.element?.querySelector('.solo-btn');
            if (soloBtn) {
                soloBtn.classList.toggle('active', track.solo);
            }
        }
    }

    /**
     * Set zoom level
     */
    setZoom(zoom) {
        this.zoom = Math.max(1, Math.min(100, zoom));
        this.scrollOffset = Math.min(this.scrollOffset, 1 - 1/this.zoom);
        this.updateScrollbar();
        this.renderTimeRuler();
        this.renderAllWaveforms();
    }

    /**
     * Zoom in
     */
    zoomIn() {
        this.setZoom(this.zoom * 1.5);
    }

    /**
     * Zoom out
     */
    zoomOut() {
        this.setZoom(this.zoom / 1.5);
    }

    /**
     * Fit timeline to window
     */
    zoomFit() {
        this.zoom = 1;
        this.scrollOffset = 0;
        this.updateScrollbar();
        this.renderTimeRuler();
        this.renderAllWaveforms();
    }

    /**
     * Render the timeline
     */
    render() {
        // Show/hide empty state
        this.emptyTimeline.classList.toggle('hidden', this.tracks.length > 0);

        // Clear existing tracks (except empty state)
        const existingRows = this.tracksContainer.querySelectorAll('.track-row');
        existingRows.forEach(row => row.remove());

        // Render each track
        this.tracks.forEach(track => this.renderTrack(track));

        // Render time ruler
        this.renderTimeRuler();
    }

    /**
     * Render a single track
     */
    renderTrack(track) {
        const row = document.createElement('div');
        row.className = 'track-row';
        row.dataset.trackId = track.id;

        if (track === this.selectedTrack) {
            row.classList.add('selected');
        }

        // Determine color class
        let colorClass = 'audio';
        if (track.type === 'subliminal') colorClass = 'subliminal';
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

        // Store reference
        track.element = row;
        track.canvas = row.querySelector('.track-waveform');

        // Set up canvas size
        const container = row.querySelector('.track-waveform-container');
        this.tracksContainer.appendChild(row);

        // Set canvas size after adding to DOM
        setTimeout(() => {
            track.canvas.width = container.clientWidth;
            track.canvas.height = container.clientHeight;
            this.renderTrackWaveform(track);
        }, 0);

        // Event listeners
        row.addEventListener('click', () => this.selectTrack(track));

        const muteBtn = row.querySelector('.mute-btn');
        muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMute(track.id);
        });

        const soloBtn = row.querySelector('.solo-btn');
        soloBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSolo(track.id);
        });

        const volumeSlider = row.querySelector('.track-volume-slider');
        volumeSlider.addEventListener('input', (e) => {
            track.volume = parseFloat(e.target.value);
            row.querySelector('.track-volume-value').textContent = `${Math.round(track.volume * 100)}%`;
        });

        volumeSlider.addEventListener('click', (e) => e.stopPropagation());
    }

    /**
     * Render waveform for a track
     */
    renderTrackWaveform(track) {
        if (!track.canvas) return;

        // Determine color
        let color = '#8b949e';
        if (track.type === 'subliminal') color = '#3b82f6';
        else if (track.type === 'binaural') color = '#a855f7';
        else if (track.type === 'ambient') color = '#10b981';

        if (track.type === 'binaural') {
            this.waveformRenderer.renderBinaural(
                track.canvas,
                track.binauralFrequency,
                track.baseFrequency,
                { color }
            );
        } else if (track.buffer) {
            this.waveformRenderer.render(
                track.canvas,
                track.buffer,
                {
                    color,
                    zoom: this.zoom,
                    scrollOffset: this.scrollOffset,
                    playheadPosition: audioEngine.currentTime
                }
            );
        }
    }

    /**
     * Render all track waveforms
     */
    renderAllWaveforms() {
        this.tracks.forEach(track => this.renderTrackWaveform(track));
    }

    /**
     * Render time ruler
     */
    renderTimeRuler() {
        if (!this.timeRulerRenderer) return;

        this.timeRulerRenderer.render(this.duration, {
            zoom: this.zoom,
            scrollOffset: this.scrollOffset,
            playheadPosition: audioEngine.currentTime
        });
    }

    /**
     * Update playhead position
     */
    updatePlayhead(time) {
        this.renderTimeRuler();
        this.renderAllWaveforms();
    }
}

// Export
window.Track = Track;
window.Timeline = Timeline;

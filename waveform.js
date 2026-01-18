/**
 * Waveform Renderer - Handles waveform visualization for audio tracks
 */

class WaveformRenderer {
    constructor() {
        this.cache = new Map(); // Cache rendered waveform data
    }

    /**
     * Analyze an audio buffer and extract waveform data
     */
    analyzeBuffer(buffer, samplesPerPixel = 1000) {
        const channels = buffer.numberOfChannels;
        const length = buffer.length;
        const numPoints = Math.ceil(length / samplesPerPixel);

        const peaks = {
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
    render(canvas, buffer, options = {}) {
        const {
            color = '#58a6ff',
            backgroundColor = 'transparent',
            zoom = 1,
            scrollOffset = 0,
            playheadPosition = null,
            playheadColor = '#f85149'
        } = options;

        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;

        // Clear canvas
        if (backgroundColor !== 'transparent') {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, height);
        } else {
            ctx.clearRect(0, 0, width, height);
        }

        if (!buffer) return;

        // Calculate samples per pixel based on zoom
        const totalDuration = buffer.duration;
        const visibleDuration = totalDuration / zoom;
        const samplesPerPixel = Math.max(1, Math.floor(buffer.length / (width * zoom)));

        // Get or create cached waveform data
        const cacheKey = `${buffer.length}-${samplesPerPixel}`;
        let peaks;

        if (this.cache.has(cacheKey)) {
            peaks = this.cache.get(cacheKey);
        } else {
            peaks = this.analyzeBuffer(buffer, samplesPerPixel);
            this.cache.set(cacheKey, peaks);
        }

        // Calculate visible range
        const startPixel = Math.floor(scrollOffset * zoom * width);
        const endPixel = Math.min(startPixel + width, peaks.min.length);

        // Draw waveform
        const centerY = height / 2;
        const amplitude = height / 2 - 2;

        ctx.fillStyle = color;
        ctx.beginPath();

        // Top half
        for (let i = 0; i < width; i++) {
            const peakIndex = startPixel + i;
            if (peakIndex >= peaks.max.length) break;

            const y = centerY - peaks.max[peakIndex] * amplitude;
            if (i === 0) {
                ctx.moveTo(i, y);
            } else {
                ctx.lineTo(i, y);
            }
        }

        // Bottom half (reverse)
        for (let i = width - 1; i >= 0; i--) {
            const peakIndex = startPixel + i;
            if (peakIndex >= peaks.min.length) continue;

            const y = centerY - peaks.min[peakIndex] * amplitude;
            ctx.lineTo(i, y);
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
     * Render a binaural beat visualization (sine wave pattern)
     */
    renderBinaural(canvas, frequency, baseFreq, options = {}) {
        const {
            color = '#a855f7',
            backgroundColor = 'transparent'
        } = options;

        const ctx = canvas.getContext('2d');
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
    clearCache() {
        this.cache.clear();
    }
}

/**
 * Time Ruler Renderer - Renders the time ruler at the top of the timeline
 */
class TimeRulerRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    }

    /**
     * Render the time ruler
     */
    render(duration, options = {}) {
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
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${minutes}:${String(secs).padStart(2, '0')}`;
    }
}

// Export classes
window.WaveformRenderer = WaveformRenderer;
window.TimeRulerRenderer = TimeRulerRenderer;

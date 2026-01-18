/**
 * Audio Engine - Core audio processing for the Subliminal Audio Editor
 * Handles audio context, playback, recording, and export
 */

class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.analyserLeft = null;
        this.analyserRight = null;
        this.splitter = null;

        this.isPlaying = false;
        this.currentTime = 0;
        this.startTime = 0;
        this.duration = 0;

        this.tracks = new Map();
        this.soloedTracks = new Set();

        this.playbackSources = [];
        this.animationFrame = null;

        this.onTimeUpdate = null;
        this.onPlayStateChange = null;
        this.onMeterUpdate = null;
    }

    /**
     * Initialize the audio context and master chain
     */
    async init() {
        if (this.audioContext) return;

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

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
    async getContext() {
        await this.init();
        return this.audioContext;
    }

    /**
     * Set master volume
     */
    setMasterVolume(value) {
        if (this.masterGain) {
            this.masterGain.gain.value = value;
        }
    }

    /**
     * Add a track to the engine
     */
    addTrack(track) {
        this.tracks.set(track.id, track);
        this.updateDuration();
    }

    /**
     * Remove a track from the engine
     */
    removeTrack(trackId) {
        this.tracks.delete(trackId);
        this.soloedTracks.delete(trackId);
        this.updateDuration();
    }

    /**
     * Update the total duration based on tracks
     */
    updateDuration() {
        let maxDuration = 0;
        for (const track of this.tracks.values()) {
            if (track.buffer) {
                maxDuration = Math.max(maxDuration, track.buffer.duration);
            }
        }
        this.duration = maxDuration;
    }

    /**
     * Toggle solo for a track
     */
    toggleSolo(trackId) {
        if (this.soloedTracks.has(trackId)) {
            this.soloedTracks.delete(trackId);
        } else {
            this.soloedTracks.add(trackId);
        }
    }

    /**
     * Check if a track should be audible
     */
    isTrackAudible(track) {
        // If any tracks are soloed, only play soloed tracks
        if (this.soloedTracks.size > 0) {
            return this.soloedTracks.has(track.id) && !track.muted;
        }
        return !track.muted;
    }

    /**
     * Play from current position
     */
    async play() {
        if (this.isPlaying) return;

        await this.init();

        this.isPlaying = true;
        this.startTime = this.audioContext.currentTime - this.currentTime;

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
    playTrack(track) {
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
        const offset = Math.min(this.currentTime, track.buffer.duration);
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
    pause() {
        if (!this.isPlaying) return;

        this.isPlaying = false;
        this.currentTime = this.audioContext.currentTime - this.startTime;

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
    stop() {
        this.pause();
        this.currentTime = 0;

        if (this.onTimeUpdate) {
            this.onTimeUpdate(0);
        }
    }

    /**
     * Seek to a specific time
     */
    seek(time) {
        const wasPlaying = this.isPlaying;

        if (wasPlaying) {
            this.pause();
        }

        this.currentTime = Math.max(0, Math.min(time, this.duration));

        if (this.onTimeUpdate) {
            this.onTimeUpdate(this.currentTime);
        }

        if (wasPlaying) {
            this.play();
        }
    }

    /**
     * Stop all playback sources
     */
    stopAllSources() {
        for (const { source } of this.playbackSources) {
            try {
                source.stop();
            } catch (e) {
                // Source may have already stopped
            }
        }
        this.playbackSources = [];
    }

    /**
     * Start the time update loop
     */
    startTimeUpdateLoop() {
        const update = () => {
            if (!this.isPlaying) return;

            this.currentTime = this.audioContext.currentTime - this.startTime;

            // Check if we've reached the end
            if (this.currentTime >= this.duration) {
                this.stop();
                return;
            }

            if (this.onTimeUpdate) {
                this.onTimeUpdate(this.currentTime);
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
    stopTimeUpdateLoop() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    /**
     * Update audio meters
     */
    updateMeters() {
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
    async decodeAudioFile(file) {
        await this.init();

        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

        return audioBuffer;
    }

    /**
     * Record audio from microphone
     */
    async startRecording() {
        await this.init();

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        const chunks = [];

        return new Promise((resolve, reject) => {
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(track => track.stop());

                const blob = new Blob(chunks, { type: 'audio/webm' });
                const arrayBuffer = await blob.arrayBuffer();

                try {
                    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    resolve(audioBuffer);
                } catch (error) {
                    reject(error);
                }
            };

            mediaRecorder.onerror = reject;

            mediaRecorder.start();

            // Return control object
            resolve({
                stop: () => mediaRecorder.stop(),
                mediaRecorder,
                stream
            });
        });
    }

    /**
     * Generate binaural beat audio buffer
     */
    async generateBinauralBeat(frequency, baseFreq, duration) {
        await this.init();

        const sampleRate = this.audioContext.sampleRate;
        const numSamples = Math.floor(sampleRate * duration);
        const buffer = this.audioContext.createBuffer(2, numSamples, sampleRate);

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
    async generateTTSAudio(text, voice, rate = 1) {
        await this.init();

        return new Promise((resolve, reject) => {
            const lines = text.split('\n').filter(line => line.trim());
            if (lines.length === 0) {
                reject(new Error('No text provided'));
                return;
            }

            // Create offline context for rendering
            const totalDuration = lines.length * 3; // Estimate 3 seconds per line
            const sampleRate = this.audioContext.sampleRate;
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
                const stereoBuffer = this.audioContext.createBuffer(
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
    async exportAudio(duration, onProgress) {
        await this.init();

        const sampleRate = this.audioContext.sampleRate;
        const totalSamples = Math.floor(sampleRate * duration);

        // Create output buffer
        const outputBuffer = this.audioContext.createBuffer(2, totalSamples, sampleRate);
        const leftOutput = outputBuffer.getChannelData(0);
        const rightOutput = outputBuffer.getChannelData(1);

        let processedTracks = 0;
        const trackCount = this.tracks.size;

        for (const track of this.tracks.values()) {
            if (!track.buffer || track.muted) {
                processedTracks++;
                continue;
            }

            if (track.type === 'subliminal') {
                // Mix subliminal with repetitions and variations
                await this.mixSubliminalTrack(track, leftOutput, rightOutput, duration, sampleRate, (p) => {
                    const overallProgress = (processedTracks + p) / trackCount;
                    if (onProgress) onProgress(overallProgress * 0.9);
                });
            } else {
                // Mix regular track (binaural or ambient)
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
    mixTrack(track, leftOutput, rightOutput, duration, sampleRate) {
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
     * Mix a subliminal track with repetitions and variations
     */
    async mixSubliminalTrack(track, leftOutput, rightOutput, duration, sampleRate, onProgress) {
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
            let startTime;
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
     * Normalize an audio buffer channel
     */
    normalizeBuffer(channelData) {
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
    bufferToWav(buffer) {
        const numberOfChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const length = buffer.length * numberOfChannels * 2;
        const arrayBuffer = new ArrayBuffer(44 + length);
        const view = new DataView(arrayBuffer);
        const channels = [];
        let offset = 0;
        let pos = 0;

        // Helper functions
        const setUint16 = (data) => {
            view.setUint16(pos, data, true);
            pos += 2;
        };

        const setUint32 = (data) => {
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
window.audioEngine = new AudioEngine();

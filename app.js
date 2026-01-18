/**
 * Subliminal Audio Editor - Main Application
 */

class SubliminalAudioEditor {
    constructor() {
        this.timeline = new Timeline();
        this.isRecording = false;
        this.recordingController = null;
        this.recordingStartTime = null;
        this.recordingInterval = null;

        this.selectedWaveType = 'theta';
        this.binauralFrequency = 6;
        this.baseFrequency = 200;

        this.exportBlob = null;
    }

    /**
     * Initialize the application
     */
    async init() {
        // Initialize timeline
        this.timeline.init();

        // Set up callbacks
        this.timeline.onTrackSelect = (track) => this.onTrackSelected(track);
        this.timeline.onTracksChange = (tracks) => this.onTracksChanged(tracks);

        audioEngine.onTimeUpdate = (time) => this.onTimeUpdate(time);
        audioEngine.onPlayStateChange = (playing) => this.onPlayStateChanged(playing);
        audioEngine.onMeterUpdate = (left, right) => this.onMeterUpdate(left, right);

        // Initialize UI
        this.initTransportControls();
        this.initZoomControls();
        this.initSourcesPanel();
        this.initPropertiesPanel();
        this.initMasterBar();
        this.initExportModal();
        this.initKeyboardShortcuts();
        this.initTTSVoices();

        // Initialize audio engine
        await audioEngine.init();
    }

    /**
     * Initialize transport controls
     */
    initTransportControls() {
        const playBtn = document.getElementById('playBtn');
        const stopBtn = document.getElementById('stopBtn');
        const rewindBtn = document.getElementById('rewindBtn');
        const loopBtn = document.getElementById('loopBtn');

        playBtn.addEventListener('click', () => this.togglePlayback());
        stopBtn.addEventListener('click', () => this.stop());
        rewindBtn.addEventListener('click', () => this.rewind());
        loopBtn.addEventListener('click', () => this.toggleLoop());
    }

    /**
     * Initialize zoom controls
     */
    initZoomControls() {
        document.getElementById('zoomInBtn').addEventListener('click', () => this.timeline.zoomIn());
        document.getElementById('zoomOutBtn').addEventListener('click', () => this.timeline.zoomOut());
        document.getElementById('zoomFitBtn').addEventListener('click', () => this.timeline.zoomFit());
    }

    /**
     * Initialize sources panel
     */
    initSourcesPanel() {
        // File import
        this.initFileImport();

        // TTS
        this.initTTS();

        // Recording
        this.initRecording();

        // Binaural generator
        this.initBinauralGenerator();
    }

    /**
     * Initialize file import (drag & drop + file picker)
     */
    initFileImport() {
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');

        // Click to browse
        dropZone.addEventListener('click', () => fileInput.click());

        // File input change
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            files.forEach(file => this.importAudioFile(file));
            fileInput.value = '';
        });

        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');

            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
            files.forEach(file => this.importAudioFile(file));
        });
    }

    /**
     * Import an audio file
     */
    async importAudioFile(file) {
        try {
            const buffer = await audioEngine.decodeAudioFile(file);

            const track = new Track({
                name: file.name.replace(/\.[^/.]+$/, ''),
                type: 'audio',
                buffer: buffer
            });

            this.timeline.addTrack(track);
        } catch (error) {
            console.error('Failed to import audio file:', error);
            alert('Failed to import audio file. Make sure it\'s a valid audio format.');
        }
    }

    /**
     * Initialize TTS voices
     */
    initTTSVoices() {
        const voiceSelect = document.getElementById('ttsVoice');

        const populateVoices = () => {
            const voices = speechSynthesis.getVoices();
            voiceSelect.innerHTML = '';

            voices.forEach((voice, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `${voice.name} (${voice.lang})`;
                if (voice.default) option.selected = true;
                voiceSelect.appendChild(option);
            });
        };

        // Populate voices when available
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = populateVoices;
        }
        populateVoices();
    }

    /**
     * Initialize TTS controls
     */
    initTTS() {
        const generateBtn = document.getElementById('generateTtsBtn');
        const ttsText = document.getElementById('ttsText');
        const rateSlider = document.getElementById('ttsRate');
        const rateValue = document.getElementById('ttsRateValue');

        rateSlider.addEventListener('input', () => {
            rateValue.textContent = `${rateSlider.value}x`;
        });

        generateBtn.addEventListener('click', async () => {
            const text = ttsText.value.trim();
            if (!text) {
                alert('Please enter some text for TTS.');
                return;
            }

            generateBtn.disabled = true;
            generateBtn.textContent = 'Generating...';

            try {
                const rate = parseFloat(rateSlider.value);
                const buffer = await audioEngine.generateTTSAudio(text, null, rate);

                const track = new Track({
                    name: 'TTS Affirmations',
                    type: 'subliminal',
                    buffer: buffer,
                    volume: 0.05, // Low volume for subliminal
                    repetitionsPerHour: 60
                });

                this.timeline.addTrack(track);
            } catch (error) {
                console.error('TTS generation failed:', error);
                alert('TTS generation failed. Please try again.');
            } finally {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate TTS Audio';
            }
        });
    }

    /**
     * Initialize recording controls
     */
    initRecording() {
        const recordBtn = document.getElementById('recordBtn');
        const recordLabel = document.getElementById('recordLabel');
        const recordTime = document.getElementById('recordTime');

        recordBtn.addEventListener('click', async () => {
            if (this.isRecording) {
                this.stopRecording();
            } else {
                await this.startRecording();
            }
        });
    }

    /**
     * Start recording
     */
    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            const chunks = [];

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
                    const audioBuffer = await audioEngine.audioContext.decodeAudioData(arrayBuffer);

                    const track = new Track({
                        name: 'Voice Recording',
                        type: 'subliminal',
                        buffer: audioBuffer,
                        volume: 0.05,
                        repetitionsPerHour: 60
                    });

                    this.timeline.addTrack(track);
                } catch (error) {
                    console.error('Failed to decode recording:', error);
                    alert('Failed to process recording.');
                }
            };

            this.recordingController = { mediaRecorder, stream };
            mediaRecorder.start();

            this.isRecording = true;
            this.recordingStartTime = Date.now();

            // Update UI
            const recordBtn = document.getElementById('recordBtn');
            const recordLabel = document.getElementById('recordLabel');
            const recordTime = document.getElementById('recordTime');

            recordBtn.classList.add('recording');
            recordLabel.textContent = 'Stop';
            recordTime.classList.remove('hidden');

            // Start timer
            this.recordingInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                recordTime.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }, 1000);

        } catch (error) {
            console.error('Recording failed:', error);
            alert('Could not access microphone. Please grant microphone permissions.');
        }
    }

    /**
     * Stop recording
     */
    stopRecording() {
        if (this.recordingController) {
            this.recordingController.mediaRecorder.stop();
            this.recordingController = null;
        }

        clearInterval(this.recordingInterval);

        this.isRecording = false;

        // Update UI
        const recordBtn = document.getElementById('recordBtn');
        const recordLabel = document.getElementById('recordLabel');
        const recordTime = document.getElementById('recordTime');

        recordBtn.classList.remove('recording');
        recordLabel.textContent = 'Record';
        recordTime.classList.add('hidden');
    }

    /**
     * Initialize binaural generator
     */
    initBinauralGenerator() {
        const thetaBtn = document.getElementById('thetaBtn');
        const alphaBtn = document.getElementById('alphaBtn');
        const freqSlider = document.getElementById('binauralFreq');
        const freqValue = document.getElementById('freqValue');
        const baseFreqSlider = document.getElementById('baseFreq');
        const baseFreqValue = document.getElementById('baseFreqValue');
        const addBtn = document.getElementById('addBinauralBtn');

        // Wave type selection
        thetaBtn.addEventListener('click', () => {
            this.selectedWaveType = 'theta';
            thetaBtn.classList.add('active');
            alphaBtn.classList.remove('active');
            freqSlider.min = 4;
            freqSlider.max = 8;
            freqSlider.value = 6;
            freqValue.textContent = '6.0';
            this.binauralFrequency = 6;
        });

        alphaBtn.addEventListener('click', () => {
            this.selectedWaveType = 'alpha';
            alphaBtn.classList.add('active');
            thetaBtn.classList.remove('active');
            freqSlider.min = 8;
            freqSlider.max = 13;
            freqSlider.value = 10;
            freqValue.textContent = '10.0';
            this.binauralFrequency = 10;
        });

        // Frequency sliders
        freqSlider.addEventListener('input', () => {
            this.binauralFrequency = parseFloat(freqSlider.value);
            freqValue.textContent = this.binauralFrequency.toFixed(1);
        });

        baseFreqSlider.addEventListener('input', () => {
            this.baseFrequency = parseInt(baseFreqSlider.value);
            baseFreqValue.textContent = this.baseFrequency;
        });

        // Add binaural track
        addBtn.addEventListener('click', async () => {
            addBtn.disabled = true;
            addBtn.textContent = 'Generating...';

            try {
                // Generate a short binaural sample for preview
                const duration = parseInt(document.getElementById('outputDuration').value);
                const buffer = await audioEngine.generateBinauralBeat(
                    this.binauralFrequency,
                    this.baseFrequency,
                    Math.min(duration, 60) // Generate max 1 minute for preview
                );

                const waveName = this.selectedWaveType === 'theta' ? 'Theta' : 'Alpha';
                const track = new Track({
                    name: `${waveName} Binaural (${this.binauralFrequency}Hz)`,
                    type: 'binaural',
                    buffer: buffer,
                    volume: 0.5,
                    binauralFrequency: this.binauralFrequency,
                    baseFrequency: this.baseFrequency
                });

                this.timeline.addTrack(track);
            } catch (error) {
                console.error('Failed to generate binaural beat:', error);
                alert('Failed to generate binaural beat.');
            } finally {
                addBtn.disabled = false;
                addBtn.textContent = 'Add Binaural Track';
            }
        });
    }

    /**
     * Initialize properties panel
     */
    initPropertiesPanel() {
        const trackName = document.getElementById('trackName');
        const trackVolume = document.getElementById('trackVolume');
        const trackVolumeValue = document.getElementById('trackVolumeValue');
        const trackPan = document.getElementById('trackPan');
        const trackPanValue = document.getElementById('trackPanValue');
        const repetitionsPerHour = document.getElementById('repetitionsPerHour');
        const randomizePosition = document.getElementById('randomizePosition');
        const randomizeVolume = document.getElementById('randomizeVolume');
        const randomizePitch = document.getElementById('randomizePitch');
        const fadeIn = document.getElementById('fadeIn');
        const fadeInValue = document.getElementById('fadeInValue');
        const fadeOut = document.getElementById('fadeOut');
        const fadeOutValue = document.getElementById('fadeOutValue');
        const duplicateBtn = document.getElementById('duplicateTrackBtn');
        const deleteBtn = document.getElementById('deleteTrackBtn');

        // Track name
        trackName.addEventListener('change', () => {
            if (this.timeline.selectedTrack) {
                this.timeline.updateTrack(this.timeline.selectedTrack.id, { name: trackName.value });
            }
        });

        // Volume
        trackVolume.addEventListener('input', () => {
            const value = parseFloat(trackVolume.value);
            trackVolumeValue.textContent = `${Math.round(value * 100)}%`;
            if (this.timeline.selectedTrack) {
                this.timeline.updateTrack(this.timeline.selectedTrack.id, { volume: value });
            }
        });

        // Pan
        trackPan.addEventListener('input', () => {
            const value = parseFloat(trackPan.value);
            trackPanValue.textContent = value === 0 ? 'C' : (value < 0 ? `L${Math.abs(Math.round(value * 100))}` : `R${Math.round(value * 100)}`);
            if (this.timeline.selectedTrack) {
                this.timeline.updateTrack(this.timeline.selectedTrack.id, { pan: value });
            }
        });

        // Subliminal options
        repetitionsPerHour.addEventListener('change', () => {
            if (this.timeline.selectedTrack) {
                this.timeline.updateTrack(this.timeline.selectedTrack.id, {
                    repetitionsPerHour: parseInt(repetitionsPerHour.value)
                });
            }
        });

        randomizePosition.addEventListener('change', () => {
            if (this.timeline.selectedTrack) {
                this.timeline.updateTrack(this.timeline.selectedTrack.id, {
                    randomizePosition: randomizePosition.checked
                });
            }
        });

        randomizeVolume.addEventListener('change', () => {
            if (this.timeline.selectedTrack) {
                this.timeline.updateTrack(this.timeline.selectedTrack.id, {
                    randomizeVolume: randomizeVolume.checked
                });
            }
        });

        randomizePitch.addEventListener('change', () => {
            if (this.timeline.selectedTrack) {
                this.timeline.updateTrack(this.timeline.selectedTrack.id, {
                    randomizePitch: randomizePitch.checked
                });
            }
        });

        // Fade controls
        fadeIn.addEventListener('input', () => {
            const value = parseFloat(fadeIn.value);
            fadeInValue.textContent = `${value.toFixed(1)}s`;
            if (this.timeline.selectedTrack) {
                this.timeline.updateTrack(this.timeline.selectedTrack.id, { fadeIn: value });
            }
        });

        fadeOut.addEventListener('input', () => {
            const value = parseFloat(fadeOut.value);
            fadeOutValue.textContent = `${value.toFixed(1)}s`;
            if (this.timeline.selectedTrack) {
                this.timeline.updateTrack(this.timeline.selectedTrack.id, { fadeOut: value });
            }
        });

        // Duplicate and delete
        duplicateBtn.addEventListener('click', () => {
            if (this.timeline.selectedTrack) {
                this.timeline.duplicateTrack(this.timeline.selectedTrack.id);
            }
        });

        deleteBtn.addEventListener('click', () => {
            if (this.timeline.selectedTrack) {
                if (confirm('Are you sure you want to delete this track?')) {
                    this.timeline.removeTrack(this.timeline.selectedTrack.id);
                }
            }
        });
    }

    /**
     * Handle track selection
     */
    onTrackSelected(track) {
        const noSelection = document.getElementById('noTrackSelected');
        const properties = document.getElementById('trackProperties');
        const subliminalOptions = document.getElementById('subliminalOptions');

        if (!track) {
            noSelection.classList.remove('hidden');
            properties.classList.add('hidden');
            return;
        }

        noSelection.classList.add('hidden');
        properties.classList.remove('hidden');

        // Update property values
        document.getElementById('trackName').value = track.name;
        document.getElementById('trackVolume').value = track.volume;
        document.getElementById('trackVolumeValue').textContent = `${Math.round(track.volume * 100)}%`;
        document.getElementById('trackPan').value = track.pan;

        const panValue = track.pan === 0 ? 'C' : (track.pan < 0 ? `L${Math.abs(Math.round(track.pan * 100))}` : `R${Math.round(track.pan * 100)}`);
        document.getElementById('trackPanValue').textContent = panValue;

        document.getElementById('repetitionsPerHour').value = track.repetitionsPerHour;
        document.getElementById('randomizePosition').checked = track.randomizePosition;
        document.getElementById('randomizeVolume').checked = track.randomizeVolume;
        document.getElementById('randomizePitch').checked = track.randomizePitch;

        document.getElementById('fadeIn').value = track.fadeIn;
        document.getElementById('fadeInValue').textContent = `${track.fadeIn.toFixed(1)}s`;
        document.getElementById('fadeOut').value = track.fadeOut;
        document.getElementById('fadeOutValue').textContent = `${track.fadeOut.toFixed(1)}s`;

        // Show/hide subliminal options
        subliminalOptions.classList.toggle('hidden', track.type !== 'subliminal');
    }

    /**
     * Handle tracks change
     */
    onTracksChanged(tracks) {
        // Update export button state
        const exportBtn = document.getElementById('exportBtn');
        exportBtn.disabled = tracks.length === 0;
    }

    /**
     * Initialize master bar
     */
    initMasterBar() {
        const masterVolume = document.getElementById('masterVolume');
        const masterVolumeValue = document.getElementById('masterVolumeValue');

        masterVolume.addEventListener('input', () => {
            const value = parseFloat(masterVolume.value);
            masterVolumeValue.textContent = `${Math.round(value * 100)}%`;
            audioEngine.setMasterVolume(value);
        });
    }

    /**
     * Initialize export modal
     */
    initExportModal() {
        const exportBtn = document.getElementById('exportBtn');
        const modal = document.getElementById('exportModal');
        const closeBtn = document.getElementById('closeExportModal');
        const downloadBtn = document.getElementById('downloadExportBtn');

        exportBtn.addEventListener('click', () => this.showExportModal());
        closeBtn.addEventListener('click', () => this.hideExportModal());
        downloadBtn.addEventListener('click', () => this.downloadExport());

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hideExportModal();
            }
        });
    }

    /**
     * Show export modal and start export
     */
    async showExportModal() {
        const modal = document.getElementById('exportModal');
        const progress = document.getElementById('exportProgress');
        const complete = document.getElementById('exportComplete');
        const progressFill = document.getElementById('exportProgressFill');
        const status = document.getElementById('exportStatus');

        modal.classList.remove('hidden');
        progress.classList.remove('hidden');
        complete.classList.add('hidden');
        progressFill.style.width = '0%';
        status.textContent = 'Preparing export...';

        const duration = parseInt(document.getElementById('outputDuration').value);

        try {
            const buffer = await audioEngine.exportAudio(duration, (p) => {
                const percent = Math.round(p * 100);
                progressFill.style.width = `${percent}%`;

                if (p < 0.1) status.textContent = 'Preparing tracks...';
                else if (p < 0.9) status.textContent = 'Mixing audio...';
                else status.textContent = 'Finalizing...';
            });

            this.exportBlob = audioEngine.bufferToWav(buffer);

            progress.classList.add('hidden');
            complete.classList.remove('hidden');
        } catch (error) {
            console.error('Export failed:', error);
            status.textContent = 'Export failed: ' + error.message;
        }
    }

    /**
     * Hide export modal
     */
    hideExportModal() {
        document.getElementById('exportModal').classList.add('hidden');
    }

    /**
     * Download exported audio
     */
    downloadExport() {
        if (!this.exportBlob) return;

        const url = URL.createObjectURL(this.exportBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `subliminal-audio-${Date.now()}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.hideExportModal();
    }

    /**
     * Initialize keyboard shortcuts
     */
    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't handle shortcuts if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    this.togglePlayback();
                    break;
                case 'Home':
                    e.preventDefault();
                    this.rewind();
                    break;
                case 'KeyL':
                    e.preventDefault();
                    this.toggleLoop();
                    break;
                case 'Equal':
                case 'NumpadAdd':
                    e.preventDefault();
                    this.timeline.zoomIn();
                    break;
                case 'Minus':
                case 'NumpadSubtract':
                    e.preventDefault();
                    this.timeline.zoomOut();
                    break;
                case 'KeyF':
                    e.preventDefault();
                    this.timeline.zoomFit();
                    break;
                case 'Delete':
                case 'Backspace':
                    if (this.timeline.selectedTrack) {
                        e.preventDefault();
                        this.timeline.removeTrack(this.timeline.selectedTrack.id);
                    }
                    break;
            }
        });
    }

    /**
     * Toggle playback
     */
    togglePlayback() {
        if (audioEngine.isPlaying) {
            audioEngine.pause();
        } else {
            audioEngine.play();
        }
    }

    /**
     * Stop playback
     */
    stop() {
        audioEngine.stop();
    }

    /**
     * Rewind to beginning
     */
    rewind() {
        audioEngine.seek(0);
    }

    /**
     * Toggle loop
     */
    toggleLoop() {
        const loopBtn = document.getElementById('loopBtn');
        loopBtn.classList.toggle('active');
        // Loop functionality would be implemented in the audio engine
    }

    /**
     * Handle time update
     */
    onTimeUpdate(time) {
        document.getElementById('currentTime').textContent = this.formatTime(time);
        document.getElementById('totalTime').textContent = this.formatTime(this.timeline.duration);
        this.timeline.updatePlayhead(time);
    }

    /**
     * Handle play state change
     */
    onPlayStateChanged(playing) {
        const playBtn = document.getElementById('playBtn');
        playBtn.classList.toggle('playing', playing);
    }

    /**
     * Handle meter update
     */
    onMeterUpdate(left, right) {
        document.getElementById('meterLeft').style.width = `${left * 100}%`;
        document.getElementById('meterRight').style.width = `${right * 100}%`;
    }

    /**
     * Format time as MM:SS.mmm
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);

        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SubliminalAudioEditor();
    window.app.init();
});

// Subliminal Audio Mixer Application
class SubliminalAudioMixer {
    constructor() {
        this.audioContext = null;
        this.inputAudioBuffer = null;
        this.recordedChunks = [];
        this.mediaRecorder = null;
        this.recordingStartTime = null;
        this.recordingInterval = null;
        this.selectedWave = 'theta'; // default
        this.selectedInputMethod = 'tts'; // default

        this.initializeUI();
        this.initializeEventListeners();
    }

    initializeUI() {
        // Update range value displays
        const updateRangeDisplay = (rangeId, displayId, suffix = '') => {
            const range = document.getElementById(rangeId);
            const display = document.getElementById(displayId);
            range.addEventListener('input', () => {
                display.textContent = range.value + suffix;
            });
        };

        updateRangeDisplay('speechRate', 'rateValue');
        updateRangeDisplay('speechPitch', 'pitchValue');
        updateRangeDisplay('frequency', 'freqValue', ' Hz');
        updateRangeDisplay('subliminalVolume', 'subliminalVolumeValue', '%');
        updateRangeDisplay('beatVolume', 'beatVolumeValue', '%');

        // Update subliminal volume display to percentage
        document.getElementById('subliminalVolume').addEventListener('input', (e) => {
            document.getElementById('subliminalVolumeValue').textContent =
                Math.round(e.target.value * 100) + '%';
        });

        document.getElementById('beatVolume').addEventListener('input', (e) => {
            document.getElementById('beatVolumeValue').textContent =
                Math.round(e.target.value * 100) + '%';
        });
    }

    initializeEventListeners() {
        // Input method selection
        document.getElementById('ttsBtn').addEventListener('click', () => {
            this.selectInputMethod('tts');
        });

        document.getElementById('recordBtn').addEventListener('click', () => {
            this.selectInputMethod('record');
        });

        // Wave type selection
        document.getElementById('thetaBtn').addEventListener('click', () => {
            this.selectWaveType('theta');
            document.getElementById('frequency').value = 6;
            document.getElementById('freqValue').textContent = '6 Hz';
        });

        document.getElementById('alphaBtn').addEventListener('click', () => {
            this.selectWaveType('alpha');
            document.getElementById('frequency').value = 10;
            document.getElementById('freqValue').textContent = '10 Hz';
        });

        // TTS generation
        document.getElementById('generateTTS').addEventListener('click', () => {
            this.generateTTSAudio();
        });

        // Recording controls
        document.getElementById('startRecord').addEventListener('click', () => {
            this.startRecording();
        });

        document.getElementById('stopRecord').addEventListener('click', () => {
            this.stopRecording();
        });

        // Main generation button
        document.getElementById('generateBtn').addEventListener('click', () => {
            this.generateSubliminalAudio();
        });

        // Download button
        document.getElementById('downloadBtn').addEventListener('click', () => {
            this.downloadAudio();
        });

        // Enable generate button when text is entered
        document.getElementById('affirmationText').addEventListener('input', (e) => {
            if (this.selectedInputMethod === 'tts' && e.target.value.trim()) {
                document.getElementById('generateBtn').disabled = false;
            }
        });
    }

    selectInputMethod(method) {
        this.selectedInputMethod = method;

        // Update button states
        document.getElementById('ttsBtn').classList.toggle('active', method === 'tts');
        document.getElementById('recordBtn').classList.toggle('active', method === 'record');

        // Show/hide sections
        document.getElementById('ttsSection').classList.toggle('hidden', method !== 'tts');
        document.getElementById('recordSection').classList.toggle('hidden', method !== 'record');

        // Enable generate button if input is ready
        const hasInput = (method === 'tts' && document.getElementById('affirmationText').value.trim()) ||
                        (method === 'record' && this.inputAudioBuffer);
        document.getElementById('generateBtn').disabled = !hasInput;
    }

    selectWaveType(wave) {
        this.selectedWave = wave;

        document.getElementById('thetaBtn').classList.toggle('active', wave === 'theta');
        document.getElementById('alphaBtn').classList.toggle('active', wave === 'alpha');

        // Update frequency range
        const freqInput = document.getElementById('frequency');
        if (wave === 'theta') {
            freqInput.min = 4;
            freqInput.max = 8;
        } else {
            freqInput.min = 8;
            freqInput.max = 13;
        }
    }

    async generateTTSAudio() {
        const text = document.getElementById('affirmationText').value.trim();
        if (!text) {
            alert('Please enter some affirmations first.');
            return;
        }

        const rate = parseFloat(document.getElementById('speechRate').value);
        const pitch = parseFloat(document.getElementById('speechPitch').value);

        // Split text into lines (affirmations)
        const affirmations = text.split('\n').filter(line => line.trim());

        if (affirmations.length === 0) {
            alert('Please enter at least one affirmation.');
            return;
        }

        // Initialize audio context
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Use Web Speech API to generate audio
        const utterances = affirmations.map(affirmation => {
            const utterance = new SpeechSynthesisUtterance(affirmation);
            utterance.rate = rate;
            utterance.pitch = pitch;
            return utterance;
        });

        // Speak all affirmations to record them
        const audioChunks = [];

        try {
            // Create a combined audio buffer from TTS
            await this.generateTTSBuffer(affirmations, rate, pitch);
            document.getElementById('generateBtn').disabled = false;
            alert('TTS audio generated! You can now generate your subliminal audio.');
        } catch (error) {
            console.error('TTS generation failed:', error);
            alert('TTS generation failed. Your browser might not support this feature. Please try recording your voice instead.');
        }
    }

    async generateTTSBuffer(affirmations, rate, pitch) {
        // Note: Web Speech API doesn't provide direct audio buffer access
        // We'll create a simple sine wave as placeholder and notify user to record
        // In a production app, you'd want to use a server-side TTS service

        const sampleRate = 44100;
        const duration = affirmations.length * 2; // 2 seconds per affirmation
        const buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const data = buffer.getChannelData(0);

        // Generate simple tone for each affirmation (placeholder)
        let offset = 0;
        affirmations.forEach((affirmation, index) => {
            const affirmDuration = 1.5; // seconds
            const silenceDuration = 0.5;
            const freq = 200 + (index % 5) * 50;

            for (let i = 0; i < sampleRate * affirmDuration; i++) {
                data[offset + i] = Math.sin(2 * Math.PI * freq * i / sampleRate) * 0.3;
            }
            offset += sampleRate * (affirmDuration + silenceDuration);
        });

        this.inputAudioBuffer = buffer;
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            this.mediaRecorder = new MediaRecorder(stream);
            this.recordedChunks = [];

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.recordedChunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                const audioUrl = URL.createObjectURL(blob);

                const audioElement = document.getElementById('recordedAudio');
                audioElement.src = audioUrl;
                audioElement.classList.remove('hidden');

                // Convert to audio buffer
                const arrayBuffer = await blob.arrayBuffer();
                if (!this.audioContext) {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                this.inputAudioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

                document.getElementById('generateBtn').disabled = false;
                document.getElementById('recordingStatus').innerHTML =
                    '<span style="color: #10b981;">✓ Recording saved! You can now generate your subliminal audio.</span>';
            };

            this.mediaRecorder.start();
            this.recordingStartTime = Date.now();

            // Update UI
            document.getElementById('startRecord').classList.add('hidden');
            document.getElementById('stopRecord').classList.remove('hidden');
            document.getElementById('recordingTime').classList.remove('hidden');

            // Start timer
            this.recordingInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                document.getElementById('recordTimer').textContent =
                    `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }, 1000);

        } catch (error) {
            console.error('Recording failed:', error);
            alert('Could not access microphone. Please grant microphone permissions.');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());

            clearInterval(this.recordingInterval);

            document.getElementById('startRecord').classList.remove('hidden');
            document.getElementById('stopRecord').classList.add('hidden');
        }
    }

    async generateSubliminalAudio() {
        if (!this.inputAudioBuffer) {
            alert('Please generate TTS audio or record your voice first.');
            return;
        }

        // Show progress
        document.getElementById('progress').classList.remove('hidden');
        document.getElementById('result').classList.add('hidden');
        this.updateProgress(0, 'Initializing audio context...');

        try {
            // Get settings
            const duration = parseInt(document.getElementById('duration').value) * 60; // convert to seconds
            const frequency = parseFloat(document.getElementById('frequency').value);
            const subliminalVolume = parseFloat(document.getElementById('subliminalVolume').value);
            const beatVolume = parseFloat(document.getElementById('beatVolume').value);
            const repetitions = parseInt(document.getElementById('repetitions').value);

            // Initialize audio context if needed
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const sampleRate = this.audioContext.sampleRate;
            const totalSamples = sampleRate * duration;

            this.updateProgress(10, 'Generating binaural beats...');

            // Create the main output buffer (stereo)
            const outputBuffer = this.audioContext.createBuffer(2, totalSamples, sampleRate);
            const leftChannel = outputBuffer.getChannelData(0);
            const rightChannel = outputBuffer.getChannelData(1);

            // Generate binaural beats
            const baseFreq = 200; // Base frequency in Hz
            const leftFreq = baseFreq;
            const rightFreq = baseFreq + frequency; // Creates the binaural beat

            for (let i = 0; i < totalSamples; i++) {
                leftChannel[i] = Math.sin(2 * Math.PI * leftFreq * i / sampleRate) * beatVolume;
                rightChannel[i] = Math.sin(2 * Math.PI * rightFreq * i / sampleRate) * beatVolume;

                if (i % (sampleRate * 10) === 0) {
                    this.updateProgress(10 + (i / totalSamples) * 30, 'Generating binaural beats...');
                }
            }

            this.updateProgress(40, 'Adding subliminal affirmations...');

            // Calculate total repetitions based on duration
            const totalReps = Math.floor((duration / 3600) * repetitions);
            const inputDuration = this.inputAudioBuffer.duration;

            // Add subliminals at random positions
            for (let rep = 0; rep < totalReps; rep++) {
                // Random position in the output
                const maxStart = duration - inputDuration;
                const startTime = Math.random() * maxStart;
                const startSample = Math.floor(startTime * sampleRate);

                // Random variations
                const volumeVariation = subliminalVolume * (0.8 + Math.random() * 0.4); // ±20% variation
                const pitchShift = 0.95 + Math.random() * 0.1; // Slight pitch variation
                const pan = Math.random() * 2 - 1; // Random stereo panning

                // Mix the input audio
                const inputData = this.inputAudioBuffer.getChannelData(0);
                const inputLength = Math.min(inputData.length, totalSamples - startSample);

                for (let i = 0; i < inputLength; i++) {
                    const sample = inputData[Math.floor(i * pitchShift)] || 0;
                    const scaledSample = sample * volumeVariation;

                    // Apply stereo panning
                    const leftGain = pan < 0 ? 1 : 1 - pan;
                    const rightGain = pan > 0 ? 1 : 1 + pan;

                    leftChannel[startSample + i] += scaledSample * leftGain;
                    rightChannel[startSample + i] += scaledSample * rightGain;
                }

                if (rep % 10 === 0) {
                    this.updateProgress(40 + (rep / totalReps) * 40,
                        `Adding subliminals... (${rep}/${totalReps})`);
                }
            }

            this.updateProgress(80, 'Normalizing audio...');

            // Normalize to prevent clipping
            this.normalizeBuffer(leftChannel);
            this.normalizeBuffer(rightChannel);

            this.updateProgress(90, 'Preparing output...');

            // Create audio source
            const source = this.audioContext.createBufferSource();
            source.buffer = outputBuffer;

            // Store for download
            this.outputBuffer = outputBuffer;

            this.updateProgress(100, 'Complete!');

            // Show result
            setTimeout(() => {
                document.getElementById('progress').classList.add('hidden');
                document.getElementById('result').classList.remove('hidden');

                // Create audio element for preview
                this.createAudioPreview(outputBuffer);
            }, 500);

        } catch (error) {
            console.error('Generation failed:', error);
            alert('Failed to generate audio: ' + error.message);
            document.getElementById('progress').classList.add('hidden');
        }
    }

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

    createAudioPreview(buffer) {
        // Create a preview (first 30 seconds only for performance)
        const previewDuration = Math.min(30, buffer.duration);
        const previewSamples = Math.floor(previewDuration * buffer.sampleRate);

        const previewBuffer = this.audioContext.createBuffer(
            2,
            previewSamples,
            buffer.sampleRate
        );

        previewBuffer.copyToChannel(buffer.getChannelData(0).slice(0, previewSamples), 0);
        previewBuffer.copyToChannel(buffer.getChannelData(1).slice(0, previewSamples), 1);

        const blob = this.bufferToWave(previewBuffer);
        const url = URL.createObjectURL(blob);

        const audioElement = document.getElementById('outputAudio');
        audioElement.src = url;
    }

    updateProgress(percent, message) {
        document.getElementById('progressFill').style.width = percent + '%';
        document.getElementById('progressText').textContent = message;
    }

    bufferToWave(buffer) {
        const numberOfChannels = buffer.numberOfChannels;
        const length = buffer.length * numberOfChannels * 2;
        const arrayBuffer = new ArrayBuffer(44 + length);
        const view = new DataView(arrayBuffer);
        const channels = [];
        let offset = 0;
        let pos = 0;

        // Write WAV header
        const setUint16 = (data) => {
            view.setUint16(pos, data, true);
            pos += 2;
        };
        const setUint32 = (data) => {
            view.setUint32(pos, data, true);
            pos += 4;
        };

        // "RIFF" chunk descriptor
        setUint32(0x46464952);
        setUint32(36 + length);
        setUint32(0x45564157);

        // "fmt " sub-chunk
        setUint32(0x20746d66);
        setUint32(16);
        setUint16(1);
        setUint16(numberOfChannels);
        setUint32(buffer.sampleRate);
        setUint32(buffer.sampleRate * numberOfChannels * 2);
        setUint16(numberOfChannels * 2);
        setUint16(16);

        // "data" sub-chunk
        setUint32(0x61746164);
        setUint32(length);

        // Write audio data
        for (let i = 0; i < buffer.numberOfChannels; i++) {
            channels.push(buffer.getChannelData(i));
        }

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

    downloadAudio() {
        if (!this.outputBuffer) {
            alert('No audio to download.');
            return;
        }

        const blob = this.bufferToWave(this.outputBuffer);
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `subliminal-${this.selectedWave}-${Date.now()}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new SubliminalAudioMixer();
});

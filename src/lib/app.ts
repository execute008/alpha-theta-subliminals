/**
 * Main Application - Client-side initialization and event handling
 */

import { audioEngine } from './audio-engine';
import { timelineManager } from './timeline-manager';
import { 
  tracks, selectedTrack, addTrack, removeTrack, updateTrack, duplicateTrack 
} from './stores/tracks';
import { 
  setPlaying, setCurrentTime, toggleLoop 
} from './stores/playback';
import { 
  appSettings, setOutputDuration, setMasterVolume, setWaveType, 
  setBinauralFrequency, setBaseFrequency,
  recordingState, setRecordingMode, startRecording, stopRecording,
  startSentenceSession, advanceToNextSentence, addRecordedSentence, 
  resetSentenceSession, reRecordCurrentSentence
} from './stores/settings';
import type { Track } from './stores/types';
import { createDefaultTrack } from './stores/types';
import { generatePlacements } from './placement-generator';

export class SubliminalAudioEditor {
  private exportBlob: Blob | null = null;
  private recordingController: { mediaRecorder: MediaRecorder; stream: MediaStream } | null = null;
  private recordingInterval: number | null = null;

  async init(): Promise<void> {
    // Note: AudioEngine.init() is deferred until first user interaction
    // to comply with browser autoplay policies
    
    // Initialize timeline
    timelineManager.init();
    
    // Set up callbacks
    timelineManager.onTrackSelect = (track) => this.onTrackSelected(track);
    audioEngine.onTimeUpdate = (time) => this.onTimeUpdate(time);
    audioEngine.onPlayStateChange = (playing) => this.onPlayStateChanged(playing);
    audioEngine.onMeterUpdate = (left, right) => this.onMeterUpdate(left, right);
    
    // Initialize all UI
    this.initTransportControls();
    this.initZoomControls();
    this.initFileImport();
    this.initTTS();
    this.initRecording();
    this.initBinauralGenerator();
    this.initPropertiesPanel();
    this.initMasterBar();
    this.initExportModal();
    this.initKeyboardShortcuts();
    this.initTTSVoices();
    
    // Update total time display
    this.updateTotalTime();
    
    console.log('SubliminalAudioEditor initialized');
  }

  // Transport Controls
  private initTransportControls(): void {
    document.getElementById('playBtn')?.addEventListener('click', () => this.togglePlayback());
    document.getElementById('stopBtn')?.addEventListener('click', () => this.stop());
    document.getElementById('rewindBtn')?.addEventListener('click', () => this.rewind());
    document.getElementById('loopBtn')?.addEventListener('click', () => {
      toggleLoop();
      document.getElementById('loopBtn')?.classList.toggle('active');
    });
  }

  private togglePlayback(): void {
    if (audioEngine.isPlaying) {
      audioEngine.pause();
    } else {
      audioEngine.play();
    }
  }

  private stop(): void {
    audioEngine.stop();
  }

  private rewind(): void {
    audioEngine.seek(0);
  }

  // Zoom Controls
  private initZoomControls(): void {
    document.getElementById('zoomInBtn')?.addEventListener('click', () => timelineManager.zoomIn());
    document.getElementById('zoomOutBtn')?.addEventListener('click', () => timelineManager.zoomOut());
    document.getElementById('zoomFitBtn')?.addEventListener('click', () => timelineManager.zoomFit());
  }

  // File Import
  private initFileImport(): void {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;

    dropZone?.addEventListener('click', () => fileInput?.click());
    
    fileInput?.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        for (const file of Array.from(files)) {
          await this.importAudioFile(file);
        }
      }
    });

    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone?.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone?.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      if (files) {
        for (const file of Array.from(files)) {
          if (file.type.startsWith('audio/')) {
            await this.importAudioFile(file);
          }
        }
      }
    });
  }

  private async importAudioFile(file: File): Promise<void> {
    try {
      const buffer = await audioEngine.decodeAudioFile(file);
      const settings = appSettings.get();
      const track = createDefaultTrack({
        name: file.name.replace(/\.[^/.]+$/, ''),
        type: 'audio',
        buffer
      });
      // Generate initial placements for the track
      track.placements = generatePlacements(track, settings.outputDuration);
      addTrack(track);
      audioEngine.addTrack(track);
    } catch (error) {
      console.error('Failed to import audio file:', error);
      alert('Failed to import audio file.');
    }
  }

  // TTS
  private initTTS(): void {
    const ttsRate = document.getElementById('ttsRate') as HTMLInputElement;
    const ttsRateValue = document.getElementById('ttsRateValue');
    const generateBtn = document.getElementById('generateTtsBtn');

    ttsRate?.addEventListener('input', () => {
      if (ttsRateValue) {
        ttsRateValue.textContent = `${parseFloat(ttsRate.value).toFixed(1)}x`;
      }
    });

    generateBtn?.addEventListener('click', async () => {
      const text = (document.getElementById('ttsText') as HTMLTextAreaElement)?.value;
      const voiceSelect = document.getElementById('ttsVoice') as HTMLSelectElement;
      const rate = parseFloat(ttsRate?.value || '1');

      if (!text?.trim()) {
        alert('Please enter some text.');
        return;
      }

      generateBtn.textContent = 'Generating...';
      (generateBtn as HTMLButtonElement).disabled = true;

      try {
        const voices = speechSynthesis.getVoices();
        const voice = voices[parseInt(voiceSelect?.value || '0')] || null;
        const buffer = await audioEngine.generateTTSAudio(text, voice, rate);
        const settings = appSettings.get();
        
        const track = createDefaultTrack({
          name: 'TTS Subliminal',
          type: 'subliminal',
          buffer,
          volume: 0.05
        });
        // Generate initial placements for the track
        track.placements = generatePlacements(track, settings.outputDuration);
        addTrack(track);
        audioEngine.addTrack(track);
      } catch (error) {
        console.error('Failed to generate TTS:', error);
        alert('Failed to generate TTS audio.');
      } finally {
        generateBtn.textContent = 'Generate TTS Audio';
        (generateBtn as HTMLButtonElement).disabled = false;
      }
    });
  }

  private initTTSVoices(): void {
    const voiceSelect = document.getElementById('ttsVoice') as HTMLSelectElement;
    
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      if (voiceSelect) {
        voiceSelect.innerHTML = voices.map((v, i) => 
          `<option value="${i}">${v.name} (${v.lang})</option>`
        ).join('');
      }
    };

    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }

  // Recording
  private initRecording(): void {
    const singleModeBtn = document.getElementById('singleRecordMode');
    const multiModeBtn = document.getElementById('multiRecordMode');
    const singlePanel = document.getElementById('singleRecordingPanel');
    const multiPanel = document.getElementById('multiRecordingPanel');

    singleModeBtn?.addEventListener('click', () => {
      setRecordingMode('single');
      singleModeBtn.classList.add('active');
      multiModeBtn?.classList.remove('active');
      singlePanel?.classList.remove('hidden');
      multiPanel?.classList.add('hidden');
    });

    multiModeBtn?.addEventListener('click', () => {
      setRecordingMode('multi');
      multiModeBtn.classList.add('active');
      singleModeBtn?.classList.remove('active');
      multiPanel?.classList.remove('hidden');
      singlePanel?.classList.add('hidden');
    });

    // Single recording
    document.getElementById('recordBtn')?.addEventListener('click', async () => {
      const state = recordingState.get();
      if (state.isRecording) {
        this.stopSingleRecording();
      } else {
        await this.startSingleRecording();
      }
    });

    // Multi-sentence recording
    this.initMultiSentenceRecording();
  }

  private async startSingleRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        
        try {
          const ctx = await audioEngine.getContext();
          const buffer = await ctx.decodeAudioData(arrayBuffer);
          const settings = appSettings.get();
          const track = createDefaultTrack({
            name: 'Voice Recording',
            type: 'subliminal',
            buffer,
            volume: 0.05
          });
          // Generate initial placements for the track
          track.placements = generatePlacements(track, settings.outputDuration);
          addTrack(track);
          audioEngine.addTrack(track);
        } catch (error) {
          console.error('Failed to decode recording:', error);
        }
      };

      this.recordingController = { mediaRecorder, stream };
      mediaRecorder.start();
      startRecording();

      this.updateRecordingUI(true, 'recordBtn', 'recordLabel', 'recordTime');
      this.startRecordingTimer('recordTime');
    } catch (error) {
      console.error('Recording failed:', error);
      alert('Could not access microphone.');
    }
  }

  private stopSingleRecording(): void {
    if (this.recordingController) {
      this.recordingController.mediaRecorder.stop();
      this.recordingController = null;
    }
    stopRecording();
    this.stopRecordingTimer();
    this.updateRecordingUI(false, 'recordBtn', 'recordLabel', 'recordTime');
  }

  // Multi-sentence recording - creates INDIVIDUAL TRACKS per sentence
  private initMultiSentenceRecording(): void {
    const startBtn = document.getElementById('startSentenceRecording');
    const finishBtn = document.getElementById('finishSentenceRecording');
    const cancelBtn = document.getElementById('cancelSentenceRecording');
    const sentenceRecordBtn = document.getElementById('sentenceRecordBtn');
    const reRecordBtn = document.getElementById('reRecordBtn');
    const acceptBtn = document.getElementById('acceptSentenceBtn');

    startBtn?.addEventListener('click', () => {
      const text = (document.getElementById('sentenceList') as HTMLTextAreaElement)?.value?.trim();
      if (!text) {
        alert('Please enter at least one sentence.');
        return;
      }

      const sentences = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
      if (sentences.length === 0) {
        alert('Please enter at least one sentence.');
        return;
      }

      startSentenceSession(sentences);
      this.updateMultiRecordingUI();

      (document.getElementById('sentenceList') as HTMLTextAreaElement).disabled = true;
      startBtn.classList.add('hidden');
      document.getElementById('sentenceRecordingUI')?.classList.remove('hidden');
      cancelBtn?.classList.remove('hidden');
    });

    sentenceRecordBtn?.addEventListener('click', async () => {
      const state = recordingState.get();
      if (state.isRecording) {
        this.stopSentenceRecording();
      } else {
        await this.startSentenceRecording();
      }
    });

    reRecordBtn?.addEventListener('click', () => {
      reRecordCurrentSentence();
      document.getElementById('sentenceActions')?.classList.add('hidden');
      this.updateMultiRecordingUI();
    });

    acceptBtn?.addEventListener('click', () => {
      const state = recordingState.get();
      const settings = appSettings.get();
      
      // Create individual track for this sentence immediately
      const currentSentence = state.recordedSentences[state.recordedSentences.length - 1];
      if (currentSentence) {
        const track = createDefaultTrack({
          name: `Subliminal: ${currentSentence.text.substring(0, 25)}${currentSentence.text.length > 25 ? '...' : ''}`,
          type: 'subliminal',
          buffer: currentSentence.buffer,
          volume: 0.05,
          repetitionsPerHour: 60,
          randomizePosition: true,
          randomizeVolume: true,
          randomizePitch: true
        });
        // Generate initial placements for the track
        track.placements = generatePlacements(track, settings.outputDuration);
        addTrack(track);
        audioEngine.addTrack(track);
      }

      advanceToNextSentence();
      document.getElementById('sentenceActions')?.classList.add('hidden');

      const newState = recordingState.get();
      if (newState.currentSentenceIndex >= newState.sentenceList.length) {
        finishBtn?.classList.remove('hidden');
        sentenceRecordBtn?.classList.add('hidden');
      }

      this.updateMultiRecordingUI();
    });

    finishBtn?.addEventListener('click', () => {
      // All tracks already created individually - just reset
      resetSentenceSession();
      this.resetMultiRecordingUI();
    });

    cancelBtn?.addEventListener('click', () => {
      resetSentenceSession();
      this.resetMultiRecordingUI();
    });
  }

  private async startSentenceRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        
        try {
          const ctx = await audioEngine.getContext();
          const buffer = await ctx.decodeAudioData(arrayBuffer);
          const state = recordingState.get();
          addRecordedSentence(state.sentenceList[state.currentSentenceIndex], buffer);
          document.getElementById('sentenceActions')?.classList.remove('hidden');
          this.updateMultiRecordingUI();
        } catch (error) {
          console.error('Failed to decode recording:', error);
        }
      };

      this.recordingController = { mediaRecorder, stream };
      mediaRecorder.start();
      startRecording();

      this.updateRecordingUI(true, 'sentenceRecordBtn', 'sentenceRecordLabel', 'sentenceRecordTime');
      this.startRecordingTimer('sentenceRecordTime');
    } catch (error) {
      console.error('Recording failed:', error);
      alert('Could not access microphone.');
    }
  }

  private stopSentenceRecording(): void {
    if (this.recordingController) {
      this.recordingController.mediaRecorder.stop();
      this.recordingController = null;
    }
    stopRecording();
    this.stopRecordingTimer();
    this.updateRecordingUI(false, 'sentenceRecordBtn', 'sentenceRecordLabel', 'sentenceRecordTime');
  }

  private updateMultiRecordingUI(): void {
    const state = recordingState.get();
    const indexEl = document.getElementById('sentenceIndex');
    const totalEl = document.getElementById('sentenceTotal');
    const currentEl = document.getElementById('currentSentence');
    const listEl = document.getElementById('recordedSentencesList');

    if (indexEl) indexEl.textContent = String(Math.min(state.currentSentenceIndex + 1, state.sentenceList.length));
    if (totalEl) totalEl.textContent = String(state.sentenceList.length);
    if (currentEl) {
      currentEl.textContent = state.currentSentenceIndex < state.sentenceList.length 
        ? state.sentenceList[state.currentSentenceIndex]
        : 'All sentences recorded!';
    }

    if (listEl) {
      listEl.innerHTML = state.sentenceList.map((sentence, idx) => {
        const isCompleted = state.recordedSentences.some(r => r.text === sentence);
        const isCurrent = idx === state.currentSentenceIndex;
        let className = 'recorded-sentence-item';
        if (isCompleted) className += ' completed';
        if (isCurrent) className += ' current';
        const icon = isCompleted ? '<span class="check-icon">✓</span>' : '<span class="pending-icon"></span>';
        const displayText = sentence.length > 30 ? sentence.substring(0, 30) + '...' : sentence;
        return `<div class="${className}">${icon}<span>${displayText}</span></div>`;
      }).join('');
    }
  }

  private resetMultiRecordingUI(): void {
    (document.getElementById('sentenceList') as HTMLTextAreaElement).disabled = false;
    document.getElementById('startSentenceRecording')?.classList.remove('hidden');
    document.getElementById('finishSentenceRecording')?.classList.add('hidden');
    document.getElementById('cancelSentenceRecording')?.classList.add('hidden');
    document.getElementById('sentenceRecordingUI')?.classList.add('hidden');
    document.getElementById('sentenceRecordBtn')?.classList.remove('hidden');
    document.getElementById('sentenceActions')?.classList.add('hidden');
    const listEl = document.getElementById('recordedSentencesList');
    if (listEl) listEl.innerHTML = '';
  }

  private updateRecordingUI(isRecording: boolean, btnId: string, labelId: string, timeId: string): void {
    const btn = document.getElementById(btnId);
    const label = document.getElementById(labelId);
    const time = document.getElementById(timeId);

    btn?.classList.toggle('recording', isRecording);
    if (label) label.textContent = isRecording ? 'Stop' : 'Record';
    time?.classList.toggle('hidden', !isRecording);
  }

  private startRecordingTimer(elementId: string): void {
    const startTime = Date.now();
    const element = document.getElementById(elementId);
    
    this.recordingInterval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      if (element) {
        element.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
    }, 1000);
  }

  private stopRecordingTimer(): void {
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
  }

  // Binaural Generator
  private initBinauralGenerator(): void {
    const thetaBtn = document.getElementById('thetaBtn');
    const alphaBtn = document.getElementById('alphaBtn');
    const freqSlider = document.getElementById('binauralFreq') as HTMLInputElement;
    const freqValue = document.getElementById('freqValue');
    const baseSlider = document.getElementById('baseFreq') as HTMLInputElement;
    const baseValue = document.getElementById('baseFreqValue');
    const addBtn = document.getElementById('addBinauralBtn');

    thetaBtn?.addEventListener('click', () => {
      setWaveType('theta');
      thetaBtn.classList.add('active');
      alphaBtn?.classList.remove('active');
      if (freqSlider) {
        freqSlider.min = '4';
        freqSlider.max = '8';
        freqSlider.value = '6';
      }
      if (freqValue) freqValue.textContent = '6.0';
      setBinauralFrequency(6);
    });

    alphaBtn?.addEventListener('click', () => {
      setWaveType('alpha');
      alphaBtn.classList.add('active');
      thetaBtn?.classList.remove('active');
      if (freqSlider) {
        freqSlider.min = '8';
        freqSlider.max = '13';
        freqSlider.value = '10';
      }
      if (freqValue) freqValue.textContent = '10.0';
      setBinauralFrequency(10);
    });

    freqSlider?.addEventListener('input', () => {
      const freq = parseFloat(freqSlider.value);
      setBinauralFrequency(freq);
      if (freqValue) freqValue.textContent = freq.toFixed(1);
    });

    baseSlider?.addEventListener('input', () => {
      const freq = parseInt(baseSlider.value);
      setBaseFrequency(freq);
      if (baseValue) baseValue.textContent = String(freq);
    });

    addBtn?.addEventListener('click', async () => {
      const settings = appSettings.get();
      (addBtn as HTMLButtonElement).disabled = true;
      addBtn.textContent = 'Generating...';

      try {
        const buffer = await audioEngine.generateBinauralBeat(
          settings.binauralFrequency,
          settings.baseFrequency,
          Math.min(settings.outputDuration, 60)
        );

        const waveName = settings.selectedWaveType === 'theta' ? 'Theta' : 'Alpha';
        const track = createDefaultTrack({
          name: `${waveName} Binaural (${settings.binauralFrequency}Hz)`,
          type: 'binaural',
          buffer,
          volume: 0.5,
          binauralFrequency: settings.binauralFrequency,
          baseFrequency: settings.baseFrequency
        });
        addTrack(track);
        audioEngine.addTrack(track);
      } catch (error) {
        console.error('Failed to generate binaural beat:', error);
        alert('Failed to generate binaural beat.');
      } finally {
        (addBtn as HTMLButtonElement).disabled = false;
        addBtn.textContent = 'Add Binaural Track';
      }
    });
  }

  // Properties Panel
  private initPropertiesPanel(): void {
    const trackName = document.getElementById('trackName') as HTMLInputElement;
    const trackVolume = document.getElementById('trackVolume') as HTMLInputElement;
    const trackVolumeValue = document.getElementById('trackVolumeValue');
    const trackPan = document.getElementById('trackPan') as HTMLInputElement;
    const trackPanValue = document.getElementById('trackPanValue');
    const repsPerHour = document.getElementById('repetitionsPerHour') as HTMLInputElement;
    const randPos = document.getElementById('randomizePosition') as HTMLInputElement;
    const randVol = document.getElementById('randomizeVolume') as HTMLInputElement;
    const randPitch = document.getElementById('randomizePitch') as HTMLInputElement;
    const fadeIn = document.getElementById('fadeIn') as HTMLInputElement;
    const fadeOut = document.getElementById('fadeOut') as HTMLInputElement;
    const duplicateBtn = document.getElementById('duplicateTrackBtn');
    const deleteBtn = document.getElementById('deleteTrackBtn');

    // Properties that require placements regeneration
    const placementProperties = ['repetitionsPerHour', 'randomizePosition', 'randomizeVolume', 'randomizePitch'];
    
    const updateProperty = (prop: string, value: unknown) => {
      const selected = selectedTrack.get();
      if (selected) {
        updateTrack(selected.id, { [prop]: value });
        // Also update the audio engine's copy
        audioEngine.updateTrack(selected.id, { [prop]: value });
        
        // Regenerate placements if a placement-related property changed
        if (placementProperties.includes(prop)) {
          const settings = appSettings.get();
          const updatedTrack = { ...selected, [prop]: value };
          const placements = generatePlacements(updatedTrack, settings.outputDuration);
          updateTrack(selected.id, { placements });
          audioEngine.updateTrack(selected.id, { placements });
        }
      }
    };

    trackName?.addEventListener('change', () => updateProperty('name', trackName.value));
    trackVolume?.addEventListener('input', () => {
      const vol = parseFloat(trackVolume.value);
      updateProperty('volume', vol);
      if (trackVolumeValue) trackVolumeValue.textContent = `${Math.round(vol * 100)}%`;
    });
    trackPan?.addEventListener('input', () => {
      const pan = parseFloat(trackPan.value);
      updateProperty('pan', pan);
      if (trackPanValue) {
        trackPanValue.textContent = pan === 0 ? 'C' : pan < 0 ? `L${Math.abs(Math.round(pan * 100))}` : `R${Math.round(pan * 100)}`;
      }
    });
    repsPerHour?.addEventListener('change', () => updateProperty('repetitionsPerHour', parseInt(repsPerHour.value)));
    randPos?.addEventListener('change', () => updateProperty('randomizePosition', randPos.checked));
    randVol?.addEventListener('change', () => updateProperty('randomizeVolume', randVol.checked));
    randPitch?.addEventListener('change', () => updateProperty('randomizePitch', randPitch.checked));
    fadeIn?.addEventListener('change', () => updateProperty('fadeIn', parseFloat(fadeIn.value)));
    fadeOut?.addEventListener('change', () => updateProperty('fadeOut', parseFloat(fadeOut.value)));

    duplicateBtn?.addEventListener('click', () => {
      const selected = selectedTrack.get();
      if (selected) {
        const newTrack = duplicateTrack(selected.id);
        if (newTrack) audioEngine.addTrack(newTrack);
      }
    });

    deleteBtn?.addEventListener('click', () => {
      const selected = selectedTrack.get();
      if (selected) {
        audioEngine.removeTrack(selected.id);
        removeTrack(selected.id);
      }
    });
  }

  // Master Bar
  private initMasterBar(): void {
    const masterVolume = document.getElementById('masterVolume') as HTMLInputElement;
    const masterVolumeValue = document.getElementById('masterVolumeValue');
    const outputDuration = document.getElementById('outputDuration') as HTMLSelectElement;

    masterVolume?.addEventListener('input', () => {
      const vol = parseFloat(masterVolume.value);
      setMasterVolume(vol);
      audioEngine.setMasterVolume(vol);
      if (masterVolumeValue) masterVolumeValue.textContent = `${Math.round(vol * 100)}%`;
    });

    outputDuration?.addEventListener('change', () => {
      const duration = parseInt(outputDuration.value);
      setOutputDuration(duration);
      this.updateTotalTime();
      
      // Regenerate placements for all tracks when timeline duration changes
      this.regenerateAllPlacements(duration);
    });
  }

  // Export Modal
  private initExportModal(): void {
    const exportBtn = document.getElementById('exportBtn');
    const closeBtn = document.getElementById('closeModalBtn');
    const downloadBtn = document.getElementById('downloadBtn');

    exportBtn?.addEventListener('click', () => this.startExport());
    closeBtn?.addEventListener('click', () => this.hideExportModal());
    downloadBtn?.addEventListener('click', () => this.downloadExport());
  }

  private async startExport(): Promise<void> {
    const settings = appSettings.get();
    const trackList = tracks.get();

    if (trackList.length === 0) {
      alert('No tracks to export.');
      return;
    }

    this.showExportModal();

    try {
      const buffer = await audioEngine.exportAudio(settings.outputDuration, (progress) => {
        const fill = document.getElementById('progressFill');
        if (fill) fill.style.width = `${progress * 100}%`;
      });

      this.exportBlob = audioEngine.bufferToWav(buffer);
      
      document.getElementById('exportProgress')?.classList.add('hidden');
      document.getElementById('exportComplete')?.classList.remove('hidden');
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed.');
      this.hideExportModal();
    }
  }

  private showExportModal(): void {
    document.getElementById('exportModal')?.classList.remove('hidden');
    document.getElementById('exportProgress')?.classList.remove('hidden');
    document.getElementById('exportComplete')?.classList.add('hidden');
    const fill = document.getElementById('progressFill');
    if (fill) fill.style.width = '0%';
  }

  private hideExportModal(): void {
    document.getElementById('exportModal')?.classList.add('hidden');
  }

  private downloadExport(): void {
    if (!this.exportBlob) return;
    const url = URL.createObjectURL(this.exportBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subliminal-${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Keyboard Shortcuts
  private initKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          this.togglePlayback();
          break;
        case 'Home':
          this.rewind();
          break;
        case 'l':
        case 'L':
          toggleLoop();
          document.getElementById('loopBtn')?.classList.toggle('active');
          break;
        case '+':
        case '=':
          timelineManager.zoomIn();
          break;
        case '-':
          timelineManager.zoomOut();
          break;
        case 'f':
        case 'F':
          timelineManager.zoomFit();
          break;
        case 'Delete':
        case 'Backspace':
          const selected = selectedTrack.get();
          if (selected) {
            audioEngine.removeTrack(selected.id);
            removeTrack(selected.id);
          }
          break;
      }
    });
  }

  // Callbacks
  private onTrackSelected(track: Track | null): void {
    const noSelection = document.getElementById('noSelection');
    const properties = document.getElementById('trackProperties');
    const subliminalSettings = document.getElementById('subliminalSettings');

    if (!track) {
      noSelection?.classList.remove('hidden');
      properties?.classList.add('hidden');
      return;
    }

    noSelection?.classList.add('hidden');
    properties?.classList.remove('hidden');

    // Update form values
    (document.getElementById('trackName') as HTMLInputElement).value = track.name;
    (document.getElementById('trackVolume') as HTMLInputElement).value = String(track.volume);
    const trackVolumeValue = document.getElementById('trackVolumeValue');
    if (trackVolumeValue) trackVolumeValue.textContent = `${Math.round(track.volume * 100)}%`;
    (document.getElementById('trackPan') as HTMLInputElement).value = String(track.pan);
    const pan = track.pan;
    const trackPanValue = document.getElementById('trackPanValue');
    if (trackPanValue) trackPanValue.textContent = pan === 0 ? 'C' : pan < 0 ? `L${Math.abs(Math.round(pan * 100))}` : `R${Math.round(pan * 100)}`;
    (document.getElementById('repetitionsPerHour') as HTMLInputElement).value = String(track.repetitionsPerHour);
    (document.getElementById('randomizePosition') as HTMLInputElement).checked = track.randomizePosition;
    (document.getElementById('randomizeVolume') as HTMLInputElement).checked = track.randomizeVolume;
    (document.getElementById('randomizePitch') as HTMLInputElement).checked = track.randomizePitch;
    (document.getElementById('fadeIn') as HTMLInputElement).value = String(track.fadeIn);
    (document.getElementById('fadeOut') as HTMLInputElement).value = String(track.fadeOut);

    // Show/hide repetition settings (available for all tracks except binaural)
    const supportsRepetition = track.type !== 'binaural';
    subliminalSettings?.classList.toggle('hidden', !supportsRepetition);
  }

  private onTimeUpdate(time: number): void {
    setCurrentTime(time);
    const currentTimeEl = document.getElementById('currentTime');
    if (currentTimeEl) currentTimeEl.textContent = this.formatTime(time);
    timelineManager.updatePlayhead(time);
  }

  private onPlayStateChanged(playing: boolean): void {
    setPlaying(playing);
    const playBtn = document.getElementById('playBtn');
    playBtn?.classList.toggle('playing', playing);
  }

  private onMeterUpdate(left: number, right: number): void {
    const meterLeft = document.getElementById('meterLeft');
    const meterRight = document.getElementById('meterRight');
    if (meterLeft) meterLeft.style.width = `${left * 100}%`;
    if (meterRight) meterRight.style.width = `${right * 100}%`;
  }

  private updateTotalTime(): void {
    const settings = appSettings.get();
    const totalTimeEl = document.getElementById('totalTime');
    if (totalTimeEl) totalTimeEl.textContent = this.formatTime(settings.outputDuration);
  }

  private formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /**
   * Regenerate placements for all tracks when timeline duration changes
   */
  private regenerateAllPlacements(timelineDuration: number): void {
    const trackList = tracks.get();
    
    for (const track of trackList) {
      // Skip binaural tracks - they don't use placements
      if (track.type === 'binaural') continue;
      
      const placements = generatePlacements(track, timelineDuration);
      updateTrack(track.id, { placements });
      audioEngine.updateTrack(track.id, { placements });
    }
  }
}

// Auto-initialize when DOM is ready
export function initApp(): void {
  const doInit = async () => {
    try {
      console.log('Initializing SubliminalAudioEditor...');
      const app = new SubliminalAudioEditor();
      await app.init();
      console.log('SubliminalAudioEditor ready!');
    } catch (error) {
      console.error('Failed to initialize app:', error);
    }
  };

  // Ensure DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', doInit);
  } else {
    // DOM already ready
    doInit();
  }
}

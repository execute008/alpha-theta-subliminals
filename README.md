# 🧠 Subliminal Audio Mixer

A powerful web-based application for creating custom subliminal audio tracks with alpha and theta binaural beats.

## Features

### 🎤 Dual Input Methods
- **Text-to-Speech (TTS)**: Enter your affirmations as text and generate speech automatically
- **Voice Recording**: Record your own voice for a personal touch

### 🌊 Binaural Beat Options
- **Theta Waves (4-8 Hz)**: Deep relaxation, meditation, creativity, REM sleep
- **Alpha Waves (8-13 Hz)**: Relaxed focus, stress reduction, learning, light meditation

### ⚙️ Customizable Settings
- **Duration**: Generate audio from 15 minutes to 10 hours
- **Subliminal Volume**: Adjust how quiet the affirmations are (1-15% of main volume)
- **Beat Volume**: Control the binaural beat intensity
- **Repetitions**: Set how many times affirmations repeat per hour (10-500)
- **Precise Frequency**: Fine-tune the exact brainwave frequency

### 🎵 Advanced Audio Processing
- **Randomization**: Subliminals are placed at random positions throughout the track
- **Variation**: Each repetition has slight pitch and volume variations for natural sound
- **Stereo Panning**: Random left/right positioning creates immersive experience
- **Normalization**: Automatic audio level adjustment prevents clipping

## How to Use

1. **Choose Input Method**
   - Select either Text-to-Speech or Voice Recording

2. **Provide Your Affirmations**
   - For TTS: Enter affirmations line by line in the text area
   - For Recording: Click "Start Recording" and speak your affirmations

3. **Select Brainwave Type**
   - Choose Theta for deep relaxation and meditation
   - Choose Alpha for focused relaxation and learning

4. **Configure Settings**
   - Select desired duration (15 min - 10 hours)
   - Adjust subliminal and beat volumes
   - Set repetition frequency

5. **Generate**
   - Click "Generate Subliminal Audio"
   - Wait for processing (larger durations take longer)
   - Preview and download your audio

## Technical Details

### Audio Processing
- **Sample Rate**: 44.1 kHz (CD quality)
- **Channels**: Stereo (required for binaural beats)
- **Format**: WAV (uncompressed for best quality)
- **Base Frequency**: 200 Hz carrier tone

### Binaural Beat Generation
Binaural beats work by playing slightly different frequencies in each ear:
- Left ear: Base frequency (200 Hz)
- Right ear: Base frequency + desired brainwave frequency
- Your brain perceives the difference as a "beat" at the target frequency

### Subliminal Mixing Algorithm
1. Generates binaural beat background (full duration)
2. Calculates total repetitions based on duration and rate
3. For each repetition:
   - Randomly selects position in track
   - Applies volume variation (±20%)
   - Applies slight pitch shift (±5%)
   - Randomly pans across stereo field
   - Mixes into background
4. Normalizes final output to prevent distortion

## Best Practices

### For Maximum Effect
- **Use Headphones**: Binaural beats require stereo separation
- **Comfortable Volume**: Keep overall volume at a comfortable level
- **Consistent Use**: Listen regularly for best results
- **Relaxed State**: Listen when you can relax and be receptive

### Safety Notes
- Don't use while driving or operating machinery
- Avoid if you have epilepsy or seizure disorders
- Start with shorter durations (15-30 minutes)
- Keep subliminal volume low (3-5% recommended)

## Browser Compatibility

Requires a modern browser with support for:
- Web Audio API
- MediaRecorder API (for voice recording)
- Speech Synthesis API (for TTS)

Tested on:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Privacy

All processing happens locally in your browser. No data is sent to any server. Your affirmations and audio remain completely private.

## Technical Stack

- **Pure JavaScript** (ES6+)
- **Web Audio API** for audio generation and processing
- **MediaRecorder API** for voice recording
- **Speech Synthesis API** for text-to-speech
- **Canvas API** for visualizations (if added)

## File Structure

```
alpha-theta-subliminals/
├── index.html          # Main application interface
├── styles.css          # UI styling and themes
├── app.js              # Core audio processing logic
└── README.md           # Documentation
```

## Future Enhancements

Potential features for future versions:
- Background music mixing (nature sounds, ambient music)
- Visual frequency analyzer
- Preset affirmation libraries
- Multiple voice TTS options
- Audio visualization during playback
- Batch generation
- Cloud save/load settings

## License

Free to use for personal and educational purposes.

## Credits

Created by Oskar Freye (oskar@freye.tech)

## Support

For issues or questions, please contact oskar@freye.tech

---

**⚠️ Disclaimer**: This tool is for personal development and relaxation purposes. Results may vary. Not a substitute for professional medical or psychological treatment.

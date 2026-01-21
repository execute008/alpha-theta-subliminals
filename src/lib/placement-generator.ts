/**
 * Placement Generator - Generates track placements for timeline visualization and export
 * 
 * Handles repetition settings including:
 * - Number of repetitions based on repetitionsPerHour
 * - Random or evenly-spaced positioning
 * - Non-overlapping placement algorithm when randomizePosition is enabled
 * - Volume and pitch randomization
 */

import type { Track, TrackPlacement } from './stores/types';

interface FreeSlot {
  start: number;
  end: number;
}

/**
 * Generate placements for a track based on its repetition settings
 * 
 * @param track - The track to generate placements for
 * @param timelineDuration - Total duration of the timeline in seconds
 * @returns Array of TrackPlacement objects
 */
export function generatePlacements(track: Track, timelineDuration: number): TrackPlacement[] {
  // Skip tracks without audio buffer (except multi-subliminal which uses sentences)
  if (!track.buffer && track.type !== 'multi-subliminal') {
    return [];
  }
  
  // Skip binaural tracks - they fill the entire timeline
  if (track.type === 'binaural') {
    return [];
  }
  
  // For multi-subliminal tracks, use sentence-based placement
  if (track.type === 'multi-subliminal') {
    return generateMultiSubliminalPlacements(track, timelineDuration);
  }
  
  // Get buffer duration
  const bufferDuration = track.buffer!.duration;
  
  // Calculate total repetitions based on repetitions per hour
  const repetitionsPerHour = track.repetitionsPerHour || 60;
  const totalRepetitions = Math.max(1, Math.floor((timelineDuration / 3600) * repetitionsPerHour));
  
  const placements: TrackPlacement[] = [];
  
  if (track.randomizePosition) {
    // Use non-overlapping random placement algorithm
    const result = generateNonOverlappingPlacements(
      totalRepetitions,
      bufferDuration,
      timelineDuration,
      track.randomizeVolume,
      track.randomizePitch
    );
    placements.push(...result);
  } else {
    // Even distribution across the timeline
    for (let rep = 0; rep < totalRepetitions; rep++) {
      // Calculate pitch shift first (affects duration)
      const pitchShift = track.randomizePitch 
        ? 0.95 + Math.random() * 0.1  // ±5%
        : 1.0;
      
      const adjustedDuration = bufferDuration / pitchShift;
      
      // Evenly distribute start times
      const availableTime = timelineDuration - adjustedDuration;
      const startTime = totalRepetitions > 1 
        ? (rep / (totalRepetitions - 1)) * availableTime
        : 0;
      
      // Volume randomization
      const volume = track.randomizeVolume
        ? 0.8 + Math.random() * 0.4  // ±20%
        : 1.0;
      
      // Random pan
      const pan = (Math.random() * 2 - 1) * 0.5;  // ±50%
      
      placements.push({
        startTime,
        endTime: startTime + adjustedDuration,
        volume,
        pitchShift,
        pan
      });
    }
  }
  
  // Sort placements by start time
  placements.sort((a, b) => a.startTime - b.startTime);
  
  return placements;
}

/**
 * Generate non-overlapping random placements
 * Falls back to allowing overlap if not all repetitions can fit without overlapping
 */
function generateNonOverlappingPlacements(
  totalRepetitions: number,
  bufferDuration: number,
  timelineDuration: number,
  randomizeVolume: boolean,
  randomizePitch: boolean
): TrackPlacement[] {
  const placements: TrackPlacement[] = [];
  
  // Track free slots - start with entire timeline
  let freeSlots: FreeSlot[] = [{ start: 0, end: timelineDuration }];
  
  for (let rep = 0; rep < totalRepetitions; rep++) {
    // Calculate pitch shift first (affects duration)
    const pitchShift = randomizePitch 
      ? 0.95 + Math.random() * 0.1  // ±5%
      : 1.0;
    
    const clipDuration = bufferDuration / pitchShift;
    
    // Find slots that can fit this clip
    const fittingSlots = freeSlots.filter(slot => (slot.end - slot.start) >= clipDuration);
    
    let startTime: number;
    
    if (fittingSlots.length > 0) {
      // Pick a random fitting slot
      const slotIndex = Math.floor(Math.random() * fittingSlots.length);
      const slot = fittingSlots[slotIndex];
      
      // Pick a random position within the slot
      const maxStart = slot.end - clipDuration;
      startTime = slot.start + Math.random() * (maxStart - slot.start);
      
      // Remove or split the used slot
      const originalSlotIndex = freeSlots.indexOf(slot);
      freeSlots.splice(originalSlotIndex, 1);
      
      // Add remaining gaps
      const endTime = startTime + clipDuration;
      
      // Gap before the placement
      if (startTime > slot.start) {
        freeSlots.push({ start: slot.start, end: startTime });
      }
      
      // Gap after the placement
      if (endTime < slot.end) {
        freeSlots.push({ start: endTime, end: slot.end });
      }
      
      // Sort slots by start time for consistency
      freeSlots.sort((a, b) => a.start - b.start);
      
      // Merge adjacent/overlapping slots (shouldn't happen but for safety)
      freeSlots = mergeSlots(freeSlots);
    } else {
      // No fitting slots available - fall back to random placement (allowing overlap)
      const maxStart = Math.max(0, timelineDuration - clipDuration);
      startTime = Math.random() * maxStart;
    }
    
    // Volume randomization
    const volume = randomizeVolume
      ? 0.8 + Math.random() * 0.4  // ±20%
      : 1.0;
    
    // Random pan
    const pan = (Math.random() * 2 - 1) * 0.5;  // ±50%
    
    placements.push({
      startTime,
      endTime: startTime + clipDuration,
      volume,
      pitchShift,
      pan
    });
  }
  
  return placements;
}

/**
 * Merge overlapping or adjacent slots
 */
function mergeSlots(slots: FreeSlot[]): FreeSlot[] {
  if (slots.length <= 1) return slots;
  
  const merged: FreeSlot[] = [slots[0]];
  
  for (let i = 1; i < slots.length; i++) {
    const last = merged[merged.length - 1];
    const current = slots[i];
    
    if (current.start <= last.end) {
      // Overlapping or adjacent - merge
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }
  
  return merged;
}

/**
 * Generate placements for multi-subliminal tracks (sentence-based)
 */
function generateMultiSubliminalPlacements(track: Track, timelineDuration: number): TrackPlacement[] {
  const sentences = track.sentences || [];
  if (sentences.length === 0) return [];
  
  const placements: TrackPlacement[] = [];
  
  const minVolume = track.minVolume ?? 0.01;
  const maxVolume = track.maxVolume ?? 0.15;
  const minLayers = track.minLayers ?? 2;
  const maxLayers = track.maxLayers ?? 4;
  
  // Track usage of each sentence for balanced distribution
  const sentenceUsage: number[] = new Array(sentences.length).fill(0);
  
  // Calculate segment size for layered placement
  const avgSentenceDuration = sentences.reduce((sum, s) => sum + (s.buffer?.duration || 1), 0) / sentences.length;
  const segmentDuration = avgSentenceDuration * 2;
  const numSegments = Math.ceil(timelineDuration / segmentDuration);
  
  // Track free slots per sentence for non-overlapping
  const freeSlotsPerSentence: FreeSlot[][] = sentences.map(() => [
    { start: 0, end: timelineDuration }
  ]);
  
  for (let seg = 0; seg < numSegments; seg++) {
    const segmentStart = seg * segmentDuration;
    const segmentEnd = Math.min(segmentStart + segmentDuration, timelineDuration);
    
    // Determine number of layers for this segment
    const numLayers = minLayers + Math.floor(Math.random() * (maxLayers - minLayers + 1));
    
    for (let layer = 0; layer < numLayers; layer++) {
      // Select sentence with lowest usage (with some randomization)
      let selectedIdx = 0;
      let minUsage = Infinity;
      
      for (let i = 0; i < sentences.length; i++) {
        const usage = sentenceUsage[i] + Math.random() * 0.5;
        if (usage < minUsage) {
          minUsage = usage;
          selectedIdx = i;
        }
      }
      
      const sentence = sentences[selectedIdx];
      if (!sentence.buffer) continue;
      
      const bufferDuration = sentence.buffer.duration;
      
      // Calculate pitch shift
      const pitchShift = track.randomizePitch
        ? 0.95 + Math.random() * 0.1
        : 1.0;
      
      const clipDuration = bufferDuration / pitchShift;
      
      // Try to find a non-overlapping position within this segment
      let startTime: number;
      const freeSlots = freeSlotsPerSentence[selectedIdx];
      
      // Find slots that overlap with this segment and can fit the clip
      const segmentSlots = freeSlots.filter(slot => 
        slot.start < segmentEnd && 
        slot.end > segmentStart &&
        (Math.min(slot.end, segmentEnd) - Math.max(slot.start, segmentStart)) >= clipDuration
      );
      
      if (segmentSlots.length > 0 && track.randomizePosition) {
        // Pick a random fitting slot
        const slot = segmentSlots[Math.floor(Math.random() * segmentSlots.length)];
        
        // Constrain to segment boundaries
        const effectiveStart = Math.max(slot.start, segmentStart);
        const effectiveEnd = Math.min(slot.end, segmentEnd);
        
        const maxStart = effectiveEnd - clipDuration;
        startTime = effectiveStart + Math.random() * (maxStart - effectiveStart);
        
        // Update free slots for this sentence
        const slotIndex = freeSlots.indexOf(slot);
        freeSlots.splice(slotIndex, 1);
        
        const endTime = startTime + clipDuration;
        if (startTime > slot.start) {
          freeSlots.push({ start: slot.start, end: startTime });
        }
        if (endTime < slot.end) {
          freeSlots.push({ start: endTime, end: slot.end });
        }
        freeSlots.sort((a, b) => a.start - b.start);
        freeSlotsPerSentence[selectedIdx] = mergeSlots(freeSlots);
      } else if (!track.randomizePosition) {
        // Even distribution within segment
        const availableTime = (segmentEnd - segmentStart) - clipDuration;
        startTime = segmentStart + (layer / numLayers) * availableTime;
      } else {
        // Fallback to random within segment (may overlap)
        const maxOffset = Math.max(0, (segmentEnd - segmentStart) - clipDuration);
        startTime = segmentStart + Math.random() * maxOffset;
      }
      
      // Random volume within subliminal range
      const volume = track.randomizeVolume
        ? minVolume + Math.random() * (maxVolume - minVolume)
        : (minVolume + maxVolume) / 2;
      
      // Random pan
      const pan = (Math.random() * 2 - 1) * 0.5;
      
      placements.push({
        startTime,
        endTime: startTime + clipDuration,
        volume,
        pitchShift,
        pan
      });
      
      sentenceUsage[selectedIdx]++;
    }
  }
  
  // Sort placements by start time
  placements.sort((a, b) => a.startTime - b.startTime);
  
  return placements;
}

/**
 * Regenerate placements for all tracks that support repetition
 */
export function regenerateAllPlacements(tracks: Track[], timelineDuration: number): Track[] {
  return tracks.map(track => {
    if (track.type === 'binaural') {
      return track;
    }
    
    const placements = generatePlacements(track, timelineDuration);
    return { ...track, placements };
  });
}

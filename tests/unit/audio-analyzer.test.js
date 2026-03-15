import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChordAnalyzerLite } from '../../public/audio-analyzer-lite.js';
import { extractForm } from '../utils/form-extractor.js';

class MockAudioBuffer {
    constructor({ length, sampleRate }) {
        this.length = length;
        this.sampleRate = sampleRate;
        this.duration = length / sampleRate;
        this.data = new Float32Array(length);
    }
    getChannelData() {
        return this.data;
    }
}

describe('Audio Analyzer (Consolidated)', () => {
    const analyzer = new ChordAnalyzerLite();
    const sampleRate = 44100;

    const getFreq = (note) => {
        const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        const name = note.slice(0, -1);
        const octave = parseInt(note.slice(-1), 10);
        const index = notes.indexOf(name);
        return 440 * 2 ** ((index + (octave - 4) * 12 - 9) / 12);
    };

    const addTone = (data, freq, start, end, vol = 0.3) => {
        const startIdx = Math.floor(start * sampleRate);
        const endIdx = Math.floor(end * sampleRate);
        for (let i = startIdx; i < endIdx; i++) {
            if (i >= data.length) {
                break;
            }
            const t = i / sampleRate;
            // Envelope for smoother onset/offset
            const envelope = Math.min(1, (t - start) * 50) * Math.min(1, (end - t) * 50);
            data[i] += Math.sin(2 * Math.PI * freq * t) * vol * envelope;
        }
    };

    const addChord = (data, root, type, start, end, vol = 0.3) => {
        const intervals = {
            maj: [0, 4, 7],
            m: [0, 3, 7],
            7: [0, 4, 7, 10],
        };
        const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        const rootIdx = notes.indexOf(root);

        // Add root in bass
        addTone(data, getFreq(`${root}2`), start, end, vol * 1.5);

        // Add triad
        intervals[type].forEach((interval) => {
            const freq = getFreq(`${notes[(rootIdx + interval) % 12]}4`);
            addTone(data, freq, start, end, vol);
        });
    };

    // Helper for simple tests
    const createChordBuffer = (noteFreqs, duration = 4.0) => {
        const buffer = new MockAudioBuffer({ length: duration * sampleRate, sampleRate });
        const data = buffer.getChannelData(0);

        noteFreqs.forEach((freq) => {
            // Use addTone logic but manually (sine wave without envelope for simple tests consistency?
            // Or use addTone? addTone has envelope. Simple tests used raw sine.
            // Let's use raw sine to match exact original simple behavior if possible, or addTone if robust.
            // addTone is better.
            addTone(data, freq, 0, duration, 0.3);
        });
        return buffer;
    };

    describe('Basic Triad Identification', () => {
        beforeEach(() => {
            vi.spyOn(console, 'warn').mockImplementation(() => {});
        });

        it('should identify a perfect C Major triad', async () => {
            // C4 (261.63), E4 (329.63), G4 (392.00)
            const buffer = createChordBuffer([261.63, 329.63, 392.0]);
            const { chords } = await analyzer.analyze(buffer, { bpm: 60 });
            expect(chords[0].chord).toBe('C');
        });

        it('should identify an A Minor triad', async () => {
            // A3 (220.00), C4 (261.63), E4 (329.63)
            const buffer = createChordBuffer([220.0, 261.63, 329.63]);
            const { chords } = await analyzer.analyze(buffer, { bpm: 60 });
            expect(chords[0].chord).toMatch(/^Am(\/E)?$/);
        });

        it('should identify a G Dominant 7th', async () => {
            // G3 (196.00), B3 (246.94), D4 (293.66), F4 (349.23)
            const buffer = createChordBuffer([196.0, 246.94, 293.66, 349.23]);
            const { chords } = await analyzer.analyze(buffer, { bpm: 60 });
            expect(chords[0].chord).toBe('G7');
        });

        it('should identify a C Major 7th (adjacent semitones check)', async () => {
            // C4 (261.63), E4 (329.63), G4 (392.00), B4 (493.88)
            // C and B are adjacent in chromagram (0 and 11)
            const buffer = createChordBuffer([261.63, 329.63, 392.0, 493.88]);
            const { chords } = await analyzer.analyze(buffer, { bpm: 60 });
            expect(chords[0].chord).toBe('Cmaj7');
        });

        it('should ignore high-frequency melody noise', async () => {
            // C Major triad + high-pitched "vocal" noise (A6 @ 1760Hz)
            const buffer = createChordBuffer([261.63, 329.63, 392.0, 1760.0]);
            const { chords } = await analyzer.analyze(buffer, { bpm: 60 });
            expect(chords[0].chord).toBe('C');
        });

        it('should handle silence as Rest', async () => {
            const buffer = new MockAudioBuffer({ length: 1 * sampleRate, sampleRate });
            const { chords } = await analyzer.analyze(buffer, { bpm: 60 });
            expect(chords[0].chord).toBe('Rest');
        });
    });

    describe('Complex Scenarios', () => {
        it('should analyze a 12-bar blues with accurate BPM and chords', async () => {
            const bpm = 120;
            const beatLen = 60 / bpm;
            const measureLen = beatLen * 4;
            const totalLen = measureLen * 12;

            const buffer = new MockAudioBuffer({ length: totalLen * sampleRate, sampleRate });
            const data = buffer.getChannelData(0);

            const progression = ['C', 'C', 'C', 'C', 'F', 'F', 'C', 'C', 'G', 'F', 'C', 'G'];

            progression.forEach((root, i) => {
                addChord(data, root, 'maj', i * measureLen, (i + 1) * measureLen);
                // Stronger "drums" for Spectral Flux
                for (let b = 0; b < 4; b++) {
                    addTone(data, 50, (i * 4 + b) * beatLen, (i * 4 + b) * beatLen + 0.1, 0.9);
                }
            });

            // Use a slight startTime to skip any alignment transients
            const analysis = await analyzer.analyze(buffer, { startTime: 0.1 });

            expect(analysis.pulse.bpm).toBeGreaterThan(110);
            expect(analysis.pulse.bpm).toBeLessThan(130);

            const chords = analysis.chords;
            const detectedChords = chords.map((r) => r.chord.replace('7', ''));
            expect(detectedChords).toContain('C');
            expect(detectedChords).toContain('F');
            expect(detectedChords).toContain('G');
        });

        it('should identify song sections based on energy', async () => {
            const beatLen = 0.5;
            const measureLen = beatLen * 4;
            const buffer = new MockAudioBuffer({ length: 64 * beatLen * sampleRate, sampleRate });
            const data = buffer.getChannelData(0);

            const pattern = ['C', 'F', 'C', 'G'];

            // Verse: Quiet
            for (let m = 0; m < 8; m++) {
                const root = pattern[m % 4];
                addChord(data, root, 'maj', m * measureLen, (m + 1) * measureLen, 0.1);
            }
            // Chorus: Loud
            for (let m = 8; m < 16; m++) {
                const root = pattern[m % 4];
                addChord(data, root, 'maj', m * measureLen, (m + 1) * measureLen, 0.9);
            }

            const analysis = await analyzer.analyze(buffer, { bpm: 120 });
            const sections = extractForm(analysis.chords, analysis.pulse);

            expect(sections.length).toBeGreaterThanOrEqual(2);
            const labels = sections.map((s) => s.label);
            expect(labels[0]).not.toBe(labels[1]);
        }, 10000);

        it('should suppress harmonics to avoid false chords', async () => {
            // C3 (130.81) + Loud overtones that might look like G or E
            const buffer = new MockAudioBuffer({ length: 1 * sampleRate, sampleRate });
            const data = buffer.getChannelData(0);
            const baseFreq = 130.81;

            for (let i = 0; i < data.length; i++) {
                const t = i / sampleRate;
                data[i] += Math.sin(2 * Math.PI * baseFreq * t) * 0.5; // Fundamental
                data[i] += Math.sin(2 * Math.PI * baseFreq * 2 * t) * 0.4; // 2nd (Octave)
                data[i] += Math.sin(2 * Math.PI * baseFreq * 3 * t) * 0.3; // 3rd (G)
            }

            const { chords } = await analyzer.analyze(buffer, { bpm: 120 });
            expect(chords[0].chord).toMatch(/^C/);
        });

        it('should robustly identify C7 blues even with chromatic walking bass', async () => {
            const bpm = 120;
            const beatLen = 60 / bpm;
            const measureLen = beatLen * 4;

            const buffer = new MockAudioBuffer({ length: measureLen * 4 * sampleRate, sampleRate });
            const data = buffer.getChannelData(0);

            // Sustained C7 Chord
            for (let m = 0; m < 4; m++) {
                addTone(data, getFreq('C3'), m * measureLen, (m + 1) * measureLen, 0.3);
                addTone(data, getFreq('E4'), m * measureLen, (m + 1) * measureLen, 0.3);
                addTone(data, getFreq('G4'), m * measureLen, (m + 1) * measureLen, 0.3);
                addTone(data, getFreq('Bb4'), m * measureLen, (m + 1) * measureLen, 0.3);
            }

            // Walking Bass
            // Measure 1
            addTone(data, getFreq('C2'), 0 * beatLen, 1 * beatLen, 0.6);
            addTone(data, getFreq('E2'), 1 * beatLen, 2 * beatLen, 0.6);
            addTone(data, getFreq('G2'), 2 * beatLen, 3 * beatLen, 0.6);
            addTone(data, getFreq('A2'), 3 * beatLen, 4 * beatLen, 0.6);

            // Measure 2
            addTone(data, getFreq('C2'), 4 * beatLen, 5 * beatLen, 0.6);
            addTone(data, getFreq('D2'), 5 * beatLen, 6 * beatLen, 0.6);
            addTone(data, getFreq('Eb2'), 6 * beatLen, 7 * beatLen, 0.6);
            addTone(data, getFreq('E2'), 7 * beatLen, 8 * beatLen, 0.6);

            // Measure 3
            addTone(data, getFreq('C2'), 8 * beatLen, 9 * beatLen, 0.6);
            addTone(data, getFreq('G2'), 9 * beatLen, 10 * beatLen, 0.6);
            addTone(data, getFreq('Bb2'), 10 * beatLen, 11 * beatLen, 0.6);
            addTone(data, getFreq('C3'), 11 * beatLen, 12 * beatLen, 0.6);

            const analysis = await analyzer.analyze(buffer, { bpm: 120 });
            const globalKey = analyzer.identifyGlobalKey(
                analyzer.calculateChromagram(data, sampleRate, { minMidi: 36, maxMidi: 84 }),
            );

            expect(analyzer.notes[globalKey.root]).toBe('C');

            const detectedChords = analysis.chords.map((r) => r.chord);
            const nonC = detectedChords.filter((c) => !c.startsWith('C'));
            expect(nonC.length).toBe(0);
            expect(detectedChords.length).toBeGreaterThan(0);
        });
    });

    describe('Structural Snapping', () => {
        const addDrumHit = (data, start, vol = 0.8) => {
            const startIdx = Math.floor(start * sampleRate);
            const duration = 0.05; // 50ms hit
            const endIdx = Math.min(data.length, startIdx + Math.floor(duration * sampleRate));
            for (let i = startIdx; i < endIdx; i++) {
                data[i] += (Math.random() * 2 - 1) * vol; // White noise hit for flux
            }
        };

        it('should snap to 120 BPM when duration is exactly 32s (16 bars) despite slightly drifting transients', async () => {
            // 120 BPM = 0.5s per beat. 16 bars = 64 beats = 32.0s.
            const totalDuration = 32.0;
            const buffer = new MockAudioBuffer({ length: totalDuration * sampleRate, sampleRate });
            const data = buffer.getChannelData(0);

            // We simulate transients at 119.5 BPM (approx 0.502s per beat)
            const noisyBeatLen = 60 / 119.5;
            for (let i = 0; i < 64; i++) {
                addDrumHit(data, i * noisyBeatLen);
            }

            const analysis = await analyzer.identifyPulse(buffer);

            // Without structural snapping, it would likely pick ~119 or 120 (rounded).
            // With snapping, it should see that 32.0s is a PERFECT 16-bar container for 120.0 BPM.
            // Note: analyzer.identifyPulse returns rounded BPM usually, but we updated it to return snapped float.
            expect(analysis.bpm).toBe(120);
            expect(analysis.beatsPerMeasure).toBe(4);
        });

        it('should snap to 90 BPM when duration is 16s (6 bars of 4/4 or 8 bars of 3/4?)', async () => {
            // 90 BPM = 0.666s per beat.
            // 8 bars of 3/4 = 24 beats. 24 * 0.666 = 16.0s.
            // 6 bars of 4/4 = 24 beats. 24 * 0.666 = 16.0s.

            const totalDuration = 16.0;
            const buffer = new MockAudioBuffer({ length: totalDuration * sampleRate, sampleRate });
            const data = buffer.getChannelData(0);

            // Transients at 89.5 BPM
            const noisyBeatLen = 60 / 89.5;
            for (let i = 0; i < 24; i++) {
                addDrumHit(data, i * noisyBeatLen);
            }

            const analysis = await analyzer.identifyPulse(buffer);

            expect(analysis.bpm).toBe(90);
        });

        it('should favor 3/4 structural anchor if transients align better', async () => {
            // 120 BPM in 3/4. 8 bars = 24 beats. Beat = 0.5s. Total = 12.0s.
            const totalDuration = 12.0;
            const buffer = new MockAudioBuffer({ length: totalDuration * sampleRate, sampleRate });
            const data = buffer.getChannelData(0);

            // Strong onsets every 3 beats
            for (let i = 0; i < 24; i++) {
                const vol = i % 3 === 0 ? 1.0 : 0.4;
                addDrumHit(data, i * 0.5, vol);
            }

            const analysis = await analyzer.identifyPulse(buffer);
            expect(analysis.bpm).toBe(120);
            expect(analysis.beatsPerMeasure).toBe(3);
        });

        it('should ignore a silent tail when calculating structural BPM', async () => {
            // 120 BPM = 32.0s for 16 bars.
            // We provide 32.5s buffer but the last 0.5s is silence.
            const totalDuration = 32.5;
            const buffer = new MockAudioBuffer({ length: totalDuration * sampleRate, sampleRate });
            const data = buffer.getChannelData(0);

            // Active content at 120 BPM
            for (let i = 0; i < 64; i++) {
                addDrumHit(data, i * 0.5);
            }

            const analysis = await analyzer.identifyPulse(buffer);

            // Without tail compensation, structural target for 16 bars would be ~118 BPM.
            // With tail compensation, it should see the 32.0s active area and snap to 120 BPM.
            expect(analysis.bpm).toBe(120);
        });
    });
});

import { describe, it, expect } from 'vitest';
import { ChordAnalyzerLite } from '../../public/audio-analyzer-lite.js';

class MockAudioBuffer {
    constructor({ length, sampleRate }) {
        this.length = length;
        this.sampleRate = sampleRate;
        this.duration = length / sampleRate;
        this.data = new Float32Array(length);
    }
    getChannelData() { return this.data; }
}

describe('Comprehensive Chord Recognition', () => {
    const analyzer = new ChordAnalyzerLite();
    const sampleRate = 44100;

    const getFreq = (note) => {
        const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        const name = note.slice(0, -1);
        const octave = parseInt(note.slice(-1));
        const index = notes.indexOf(name);
        return 440 * Math.pow(2, (index + (octave - 4) * 12 - 9) / 12);
    };

    const addTone = (data, freq, start, end, vol = 0.3) => {
        const startIdx = Math.floor(start * sampleRate);
        const endIdx = Math.floor(end * sampleRate);
        for (let i = startIdx; i < endIdx; i++) {
            if (i >= data.length) break;
            const t = i / sampleRate;
            data[i] += Math.sin(2 * Math.PI * freq * t) * vol;
        }
    };

    const createChordBuffer = (notesList, duration = 1.0) => {
        const buffer = new MockAudioBuffer({ length: duration * sampleRate, sampleRate });
        const data = buffer.getChannelData(0);
        notesList.forEach(n => {
            addTone(data, getFreq(n), 0, duration, 0.3);
        });
        return buffer;
    };

    const CHORD_TYPES = [
        { type: 'maj', name: 'C', notes: ['C4', 'E4', 'G4'] },
        { type: 'm', name: 'Cm', notes: ['C4', 'Eb4', 'G4'] },
        { type: '7', name: 'C7', notes: ['C4', 'E4', 'G4', 'Bb4'] },
        { type: 'maj7', name: 'Cmaj7', notes: ['C4', 'E4', 'G4', 'B4'] },
        { type: '6', name: 'C6', notes: ['C4', 'E4', 'G4', 'A4'] },
        { type: 'm6', name: 'Cm6', notes: ['C4', 'Eb4', 'G4', 'A4'] },
        { type: 'sus4', name: 'Csus4', notes: ['C4', 'F4', 'G4'] },
        { type: 'dim', name: 'Cdim', notes: ['C4', 'Eb4', 'Gb4'] },
    ];

    CHORD_TYPES.forEach(c => {
        it(`should identify ${c.name} (${c.type})`, async () => {
            const buffer = createChordBuffer(c.notes);
            const { chords } = await analyzer.analyze(buffer, { bpm: 120 });
            // Check best chord. Note: analyze returns smoothed results.
            // For 1.0s buffer at 120bpm, we have 2 beats.
            expect(chords.length).toBeGreaterThan(0);
            expect(chords[0].chord).toBe(c.name);
        });
    });

    it('should identify Cm7 (m7)', async () => {
        const buffer = createChordBuffer(['C4', 'Eb4', 'G4', 'Bb4']);
        const { chords } = await analyzer.analyze(buffer, { bpm: 120 });
        // Cm7 (C Eb G Bb) share same notes as Eb6 (Eb G Bb C).
        expect(['Cm7', 'Eb6']).toContain(chords[0].chord);
    });

    describe('Slash Chords (Inversions)', () => {
        it('should identify C/E (1st Inversion)', async () => {
            // Bass E2 (within range 24-42: E2 is 40. Range is up to 42. Good.)
            // Chord: C4, G4, C5
            const buffer = createChordBuffer(['E2', 'C4', 'G4', 'C5']);
            const { chords } = await analyzer.analyze(buffer, { bpm: 120 });
            expect(chords[0].chord).toBe('C/E');
        });

        it('should identify C/G (2nd Inversion)', async () => {
            // Testing G2 (43) which was previously outside default bass range (24-42)
            const buffer = createChordBuffer(['G2', 'C4', 'E4', 'C5']);
            const { chords } = await analyzer.analyze(buffer, { bpm: 120 });
            expect(chords[0].chord).toBe('C/G');
        });

        it('should identify Am/G (Minor 7th in bass? No, G is 7th of Am)', async () => {
            // Am: A, C, E. Bass G.
            // G is 7th relative to A (0, 3, 7, 10).
            // Logic says: IGNORE 7th in bass.
            // So this should probably detect as just Am or Am7, NOT Am/G?
            // "const isStableInversion = [3, 4, 7].includes(interval);"
            // 3=m3, 4=M3, 7=P5.
            // G is m7 (10 semitones). Not in list.
            
            const buffer = createChordBuffer(['G1', 'A3', 'C4', 'E4']);
            const { chords } = await analyzer.analyze(buffer, { bpm: 120 });
            
            // Should be Am7 or Am.
            // If bass G is strong, does it confuse root detection?
            // Root A. Bass G.
            // It might detect as Am7.
            // Or if G is Bass, maybe C/G (C6/G)? A is 6th of C.
            // Let's see what it does.
            expect(['Am7', 'Am', 'C6/G']).toContain(chords[0].chord); 
        });
        
        it('should identify F/C (2nd Inversion)', async () => {
            // C2 is 36. Inside range.
            const buffer = createChordBuffer(['C2', 'F3', 'A3', 'F4']);
            const { chords } = await analyzer.analyze(buffer, { bpm: 120 });
            expect(chords[0].chord).toBe('F/C');
        });
    });
});

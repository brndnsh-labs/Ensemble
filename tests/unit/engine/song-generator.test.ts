import { describe, expect, it, vi } from 'vitest';
import { GENRE_NAMES } from '../../../public/data/smart-genres.js';
import { generateSong, predictStructure } from '../../../public/song-generator.js';

describe('Song Generator', () => {
    it('generates a song with default options', () => {
        const result = generateSong();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty('label');
        expect(result[0]).toHaveProperty('value');
        expect(result[0]).toHaveProperty('key');
    });

    it('respects a specific key', () => {
        const result = generateSong({ key: 'Eb', feel: 'Rock' });
        expect(result[0].key).toBe('Eb');
    });

    it('uses minor pool when isMinor is set', () => {
        const sections = generateSong({
            feel: 'Rock',
            isMinor: true,
            key: 'A',
        });
        // Minor pool emits lowercase Roman numerals like 'i', 'iv', 'v', 'bVI'.
        const allChords = sections.map((s) => s.value).join(' ');
        expect(allChords).toMatch(/\bi\b|\biv\b|\bv\b|bVI|bVII/);
    });

    it('respects a specific time signature', () => {
        const result = generateSong({ timeSignature: '3/4', feel: 'Rock' });
        expect(result[0].timeSignature).toBe('3/4');
    });

    it('handles random time signature selection', () => {
        const spy = vi.spyOn(Math, 'random');
        spy.mockReturnValue(0.5);
        let result = generateSong({ timeSignature: 'Random', feel: 'Rock' });
        expect(result[0].timeSignature).toBe('4/4');

        spy.mockReturnValue(0.8);
        result = generateSong({ timeSignature: 'Random', feel: 'Rock' });
        expect(result[0].timeSignature).toBe('3/4');

        spy.mockReturnValue(0.95);
        result = generateSong({ timeSignature: 'Random', feel: 'Rock' });
        expect(result[0].timeSignature).toBe('6/8');

        spy.mockRestore();
    });

    it('produces 12-bar verses for Blues feel', () => {
        const result = generateSong({ feel: 'Blues', targetMinutes: 2, bpm: 80 });
        const verses = result.filter((s) => s.label === 'Verse');
        expect(verses.length).toBeGreaterThan(0);
        expect(verses[0].value.split(' | ').length).toBe(12);
    });

    it('emits AABA structure for Jazz feel', () => {
        const sections = generateSong({ feel: 'Jazz', targetMinutes: 2.5, bpm: 120 });
        const labels = sections.map((s) => s.label);
        // Should contain A1, A2, B, A3 (potentially with Intro/Outro at the ends).
        expect(labels).toContain('A1');
        expect(labels).toContain('A2');
        expect(labels).toContain('B');
        expect(labels).toContain('A3');
    });

    it('motif memory: A sections share the same progression in jazz', () => {
        const sections = generateSong({ feel: 'Jazz', targetMinutes: 1.5, bpm: 120 });
        const aSections = sections.filter((s) => /^A\d/.test(s.label));
        expect(aSections.length).toBeGreaterThanOrEqual(2);
        const first = aSections[0].value;
        aSections.forEach((a) => expect(a.value).toBe(first));
    });

    it('Jazz feel tilts the majority of bare degrees to maj7 / 7 / m7', () => {
        const sections = generateSong({ feel: 'Jazz', targetMinutes: 2, bpm: 120 });
        const tokens = sections.flatMap((s) => s.value.split(' | ').map((c) => c.trim()));
        // Tokens of interest are the degrees that JAZZ_TILT touches (no accidentals).
        const tilted = tokens.filter((t) => /^(Imaj7|IVmaj7|V7|ii7|vi7|iii7|im7|iv7)$/.test(t));
        const candidates = tokens.filter((t) =>
            /^(I|IV|V|ii|vi|iii|i|iv|Imaj7|IVmaj7|V7|ii7|vi7|iii7|im7|iv7)$/.test(t),
        );
        expect(candidates.length).toBeGreaterThan(0);
        // The jazz pool is dominated by these degrees; tilt should hit the majority.
        const ratio = tilted.length / candidates.length;
        expect(ratio).toBeGreaterThanOrEqual(0.6);
    });

    it('Rock feel keeps triads (no automatic 7ths)', () => {
        const sections = generateSong({ feel: 'Rock', targetMinutes: 2, bpm: 120 });
        const allChords = sections.map((s) => s.value).join(' ');
        // Should contain at least some bare Roman numerals (no maj7/9 overlay).
        // The pop pool itself contains some bVII/bVI but no maj7 unless we tilt.
        expect(allChords).not.toMatch(/maj7|maj9/);
    });

    it('Funk feel adds 7ths on common scale degrees', () => {
        const sections = generateSong({ feel: 'Funk', targetMinutes: 2, bpm: 110 });
        const allChords = sections.map((s) => s.value).join(' ');
        expect(allChords).toMatch(/I7|IV7|V7|ii7/);
    });

    it('targetMinutes + bpm together drive the section count (longer ≥ shorter)', () => {
        const short = generateSong({
            feel: 'Rock',
            targetMinutes: 1,
            bpm: 120,
            timeSignature: '4/4',
        });
        const long = generateSong({
            feel: 'Rock',
            targetMinutes: 6,
            bpm: 120,
            timeSignature: '4/4',
        });
        expect(long.length).toBeGreaterThanOrEqual(short.length);
    });

    it('form="loop" produces a single Main section', () => {
        const result = generateSong({
            feel: 'Funk',
            form: 'loop',
            targetMinutes: 2,
            bpm: 100,
        });
        expect(result.length).toBe(1);
        expect(result[0].label).toBe('Main');
    });

    it('places a seed at the matching Role section and copies it to repeats', () => {
        const seed = { chords: ['I', 'IV', 'V', 'I'], role: 'chorus' as const };
        const result = generateSong({
            feel: 'Rock',
            targetMinutes: 3,
            bpm: 120,
            seed,
        });
        const choruses = result.filter((s) => s.label === 'Chorus');
        expect(choruses.length).toBeGreaterThan(0);
        // The seed becomes a 4-bar progression; choruses should all match.
        const expected = 'I | IV | V | I | I | IV | V | I'; // looped to 8 bars
        choruses.forEach((c) => expect(c.value).toBe(expected));
    });

    it('Role "unknown" still places the seed somewhere in the song', () => {
        const seed = { chords: ['vi', 'IV', 'I', 'V'], role: 'unknown' as const };
        const result = generateSong({
            feel: 'Rock',
            targetMinutes: 2,
            bpm: 120,
            seed,
        });
        const allChords = result.map((s) => s.value).join(' | ');
        expect(allChords).toContain('vi | IV | I | V');
    });

    it('predictStructure returns the same labels generateSong would use', () => {
        const opts = {
            feel: 'Rock',
            targetMinutes: 3,
            bpm: 120,
            timeSignature: '4/4',
        };
        const predicted = predictStructure(
            opts.targetMinutes,
            opts.bpm,
            opts.timeSignature,
            'verse-chorus',
            opts.feel,
        );
        const generated = generateSong(opts).map((s) => s.label);
        expect(generated).toEqual(predicted);
    });

    it('Jazz feel + isMinor uses the jazz_minor pool (lowercase i, dominant V)', () => {
        const sections = generateSong({
            feel: 'Jazz',
            isMinor: true,
            key: 'A',
            targetMinutes: 2,
            bpm: 120,
        });
        const tokens = sections.flatMap((s) => s.value.split(' | ').map((c) => c.trim()));
        // Minor tonic should dominate; major I should be absent.
        const minorTonic = tokens.filter((t) => t === 'im7' || t === 'i').length;
        const majorTonic = tokens.filter((t) => t === 'Imaj7' || t === 'I').length;
        expect(minorTonic).toBeGreaterThan(0);
        expect(majorTonic).toBe(0);
        // The cadence dominant should be V7 (uppercase V got tilted), not v7.
        expect(tokens).not.toContain('v7');
    });

    it('Blues feel + isMinor uses the blues_minor pool (minor tonic + dominant V)', () => {
        const sections = generateSong({
            feel: 'Blues',
            isMinor: true,
            key: 'A',
            targetMinutes: 2,
            bpm: 110,
        });
        const tokens = sections.flatMap((s) => s.value.split(' | ').map((c) => c.trim()));
        // Should see minor tonic (i) and dominant V7, never major I7.
        expect(tokens).toContain('i');
        expect(tokens).toContain('V7');
        expect(tokens).not.toContain('I7');
    });

    it('reuses memory for repeated Verse sections', () => {
        const result = generateSong({
            feel: 'Rock',
            targetMinutes: 2.5,
            bpm: 120,
            timeSignature: '4/4',
        });
        const verses = result.filter((s) => s.label === 'Verse');
        if (verses.length >= 2) {
            expect(verses[0].value).toBe(verses[1].value);
        }
    });

    // --- #1165: the canon-vs-feel axis guard ---------------------------------
    //
    // `generateSong` resolves `options.feel` against FEEL_BASE_POOL, which is keyed on the
    // CANON genre names (GENRE_NAMES). Anything else trips the `!FEEL_BASE_POOL[feel]` guard
    // and is silently replaced by `rand(GENRE_NAMES)` — a uniformly random genre.
    //
    // Detection: with Math.random pinned, a rerolled feel produces byte-identical output to a
    // feel string that is definitely not a genre. An honored feel picks its own base pool, so
    // it differs from that reroll baseline at any pin where the reroll lands on a different
    // pool. Two pins are enough to cover all three pools (0.05 -> Rock/pop, 0.42 -> Blues/blues).
    const REROLL_PINS = [0.05, 0.42];
    const NOT_A_GENRE = '__definitely-not-a-genre__';

    const renderWithPin = (feel: string, pin: number): string => {
        const spy = vi.spyOn(Math, 'random').mockReturnValue(pin);
        try {
            return generateSong({ feel, key: 'C', bpm: 100 })
                .map((section) => section.value)
                .join(' | ');
        } finally {
            spy.mockRestore();
        }
    };

    // True only when a feel took the reroll branch at every pin we probe.
    const wasRerolled = (feel: string): boolean =>
        REROLL_PINS.every((pin) => renderWithPin(feel, pin) === renderWithPin(NOT_A_GENRE, pin));

    it('honors every canonical genre name (none is silently rerolled)', () => {
        const rerolled = GENRE_NAMES.filter((genre) => wasRerolled(genre));
        expect(rerolled, 'canon genres that fell through to a random reroll').toEqual([]);
    });

    it('rerolls the runtime genreFeel strings that diverge from canon', () => {
        // The control that keeps the test above non-vacuous: these two ARE rejected, which is
        // exactly why feeding `groove.genreFeel` (rather than the canon `groove.lastSmartGenre`)
        // made Surprise Me's "Match my groove" randomize for Bossa and Ska-Punk.
        expect(wasRerolled('Bossa Nova')).toBe(true);
        expect(wasRerolled('Ska')).toBe(true);
        // ...and their canon spellings are not.
        expect(wasRerolled('Bossa')).toBe(false);
        expect(wasRerolled('Ska-Punk')).toBe(false);
    });
});

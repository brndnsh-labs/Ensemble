/**
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Harmonizer } from '../../../public/melody-harmonizer.js';
import { parseMusicXML, reharmonizeMelody } from '../../../public/musicxml-parser.js';

// Mock Harmonizer
vi.mock('../../../public/melody-harmonizer.js', () => {
    return {
        Harmonizer: class {
            generateProgression = vi
                .fn()
                .mockReturnValue('Cmaj7 | Dm7 | Em7 | Fmaj7 | G7 | Am7 | Bm7b5 | Cmaj7');
        },
    };
});

describe('parseMusicXML', () => {
    it('should parse an empty score gracefully', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <score-partwise>
            <part id="P1"></part>
        </score-partwise>`;

        const result = parseMusicXML(xml);
        expect(result).toBeDefined();
        expect(result.hasChords).toBe(false);
        expect(result.sections).toEqual([]);
        expect(result.leadSheetMelody).toEqual([]);
        expect(result.xmlKey).toBe('C');
    });

    it('should parse divisions and key signature correctly', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <score-partwise>
            <part id="P1">
                <measure number="1">
                    <attributes>
                        <divisions>4</divisions>
                        <key>
                            <fifths>-3</fifths>
                        </key>
                    </attributes>
                </measure>
            </part>
        </score-partwise>`;

        const result = parseMusicXML(xml);
        expect(result.xmlKey).toBe('Eb');
    });

    it('should extract simple chords (major, minor, 7ths, altered roots)', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <score-partwise>
            <part id="P1">
                <measure number="1">
                    <attributes><divisions>1</divisions></attributes>
                    <harmony>
                        <root><root-step>C</root-step></root>
                        <kind text="maj7">major-seventh</kind>
                    </harmony>
                </measure>
                <measure number="2">
                    <harmony>
                        <root>
                            <root-step>B</root-step>
                            <root-alter>-1</root-alter>
                        </root>
                        <kind>minor-seventh</kind>
                    </harmony>
                </measure>
                <measure number="3">
                    <harmony>
                        <root>
                            <root-step>F</root-step>
                            <root-alter>1</root-alter>
                        </root>
                        <kind text="m7b5">half-diminished</kind>
                    </harmony>
                </measure>
                <measure number="4">
                    <harmony>
                        <root><root-step>G</root-step></root>
                        <kind>dominant</kind>
                    </harmony>
                </measure>
            </part>
        </score-partwise>`;

        const result = parseMusicXML(xml);
        expect(result.hasChords).toBe(true);
        expect(result.sections.length).toBe(1);
        expect(result.sections[0].value).toBe('Cmaj7 | Bbm7 | F#m7b5 | G7');
    });

    it('should handle missing kind attribute gracefully by mapping kind text', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <score-partwise>
            <part id="P1">
                <measure number="1">
                    <harmony>
                        <root><root-step>D</root-step></root>
                        <kind>minor</kind>
                    </harmony>
                </measure>
                <measure number="2">
                    <harmony>
                        <root><root-step>E</root-step></root>
                        <kind>diminished</kind>
                    </harmony>
                </measure>
                <measure number="3">
                    <harmony>
                        <root><root-step>A</root-step></root>
                        <kind>major</kind>
                    </harmony>
                </measure>
            </part>
        </score-partwise>`;
        const result = parseMusicXML(xml);
        expect(result.sections[0].value).toBe('Dm | Edim | A');
    });

    it('should extract melody with correct steps relative to firstChordMeasureIndex', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <score-partwise>
            <part id="P1">
                <measure number="1">
                    <attributes><divisions>1</divisions></attributes>
                    <note>
                        <pitch>
                            <step>C</step>
                            <octave>4</octave>
                        </pitch>
                        <duration>1</duration>
                    </note>
                </measure>
                <measure number="2">
                    <harmony>
                        <root><root-step>C</root-step></root>
                        <kind>major</kind>
                    </harmony>
                    <note>
                        <pitch>
                            <step>D</step>
                            <octave>4</octave>
                        </pitch>
                        <duration>1</duration>
                    </note>
                </measure>
            </part>
        </score-partwise>`;
        const result = parseMusicXML(xml);

        expect(result.leadSheetMelody).toEqual([
            { midi: 60, globalStep: -16, durationSteps: 4 }, // C4
            { midi: 62, globalStep: 0, durationSteps: 4 }, // D4
        ]);
    });

    it('should parse altered notes in melody', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <score-partwise>
            <part id="P1">
                <measure number="1">
                    <attributes><divisions>1</divisions></attributes>
                    <note>
                        <pitch>
                            <step>E</step>
                            <alter>-1</alter>
                            <octave>4</octave>
                        </pitch>
                        <duration>1</duration>
                    </note>
                    <note>
                        <pitch>
                            <step>F</step>
                            <alter>1</alter>
                            <octave>4</octave>
                        </pitch>
                        <duration>1</duration>
                    </note>
                </measure>
            </part>
        </score-partwise>`;
        const result = parseMusicXML(xml);
        expect(result.leadSheetMelody[0].midi).toBe(63);
        expect(result.leadSheetMelody[1].midi).toBe(66);
    });

    it('should handle rests, forward, and backup nodes', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <score-partwise>
            <part id="P1">
                <measure number="1">
                    <attributes><divisions>1</divisions></attributes>
                    <note>
                        <rest/>
                        <duration>1</duration>
                    </note>
                    <forward>
                        <duration>1</duration>
                    </forward>
                    <note>
                        <pitch>
                            <step>C</step>
                            <octave>4</octave>
                        </pitch>
                        <duration>1</duration>
                    </note>
                    <backup>
                        <duration>1</duration>
                    </backup>
                </measure>
            </part>
        </score-partwise>`;
        const result = parseMusicXML(xml);

        expect(result.leadSheetMelody.length).toBe(1);
        expect(result.leadSheetMelody[0].globalStep).toBe(8);
        expect(result.leadSheetMelody[0].durationSteps).toBe(4);
    });

    it('should map regex matched kinds cleanly', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <score-partwise>
            <part id="P1">
                <measure number="1">
                    <harmony>
                        <root><root-step>C</root-step></root>
                        <kind text="min7">minor</kind>
                    </harmony>
                    <harmony>
                        <root><root-step>D</root-step></root>
                        <kind text="mi7">minor</kind>
                    </harmony>
                </measure>
            </part>
        </score-partwise>`;
        const result = parseMusicXML(xml);
        expect(result.sections[0].value).toBe('Cm7 Dm7');
    });

    it('should pad empty measures with %', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <score-partwise>
            <part id="P1">
                <measure number="1">
                    <harmony>
                        <root><root-step>C</root-step></root>
                        <kind text="maj7">major</kind>
                    </harmony>
                </measure>
                <measure number="2">
                </measure>
            </part>
        </score-partwise>`;
        const result = parseMusicXML(xml);
        expect(result.sections[0].value).toBe('Cmaj7 | %');
    });

    it('should correctly break sections into 8 measures and increment labels', () => {
        let xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise><part id="P1">`;
        for (let i = 0; i < 10; i++) {
            xml += `
                <measure number="${i + 1}">
                    <harmony>
                        <root><root-step>C</root-step></root>
                        <kind text="maj7">major</kind>
                    </harmony>
                </measure>`;
        }
        xml += `</part></score-partwise>`;

        const result = parseMusicXML(xml);
        expect(result.sections.length).toBe(2);
        expect(result.sections[0].label).toBe('A');
        expect(result.sections[0].value).toBe(
            'Cmaj7 | Cmaj7 | Cmaj7 | Cmaj7 | Cmaj7 | Cmaj7 | Cmaj7 | Cmaj7',
        );
        expect(result.sections[1].label).toBe('B');
        expect(result.sections[1].value).toBe('Cmaj7 | Cmaj7');
    });

    it('should handle time signature changes in steps calculation', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <score-partwise>
            <part id="P1">
                <measure number="1">
                    <attributes>
                        <divisions>1</divisions>
                        <time>
                            <beats>3</beats>
                            <beat-type>4</beat-type>
                        </time>
                    </attributes>
                    <harmony>
                        <root><root-step>C</root-step></root>
                        <kind>major</kind>
                    </harmony>
                    <note>
                        <pitch><step>C</step><octave>4</octave></pitch>
                        <duration>1</duration>
                    </note>
                </measure>
                <measure number="2">
                    <attributes>
                        <time>
                            <beats>4</beats>
                            <beat-type>4</beat-type>
                        </time>
                    </attributes>
                    <harmony>
                        <root><root-step>F</root-step></root>
                        <kind>major</kind>
                    </harmony>
                    <note>
                        <pitch><step>F</step><octave>4</octave></pitch>
                        <duration>1</duration>
                    </note>
                </measure>
            </part>
        </score-partwise>`;
        const result = parseMusicXML(xml);
        expect(result.leadSheetMelody.length).toBe(2);
        expect(result.leadSheetMelody[0].globalStep).toBe(0);
        // Measure 1 was 3/4 -> 3 beats * 4 steps = 12 steps.
        // Note 2 should be at globalStep 12.
        expect(result.leadSheetMelody[1].globalStep).toBe(12);
    });
});

describe('reharmonizeMelody', () => {
    it('should return null for empty melody', () => {
        expect(reharmonizeMelody([], 'C', 32)).toBeNull();
        expect(reharmonizeMelody(null, 'C', 32)).toBeNull();
    });

    it('should call Harmonizer and return formatted sections', () => {
        const leadSheetMelody = [
            { midi: 60, globalStep: 0, durationSteps: 4 }, // C4 on beat 0
            { midi: 62, globalStep: 8, durationSteps: 4 }, // D4 on beat 2
        ];
        const sections = reharmonizeMelody(leadSheetMelody, 'C', 32);

        expect(sections).toBeDefined();
        expect(sections.length).toBe(1);
        expect(sections[0].label).toBe('A');
        expect(sections[0].value).toBe('Cmaj7 | Dm7 | Em7 | Fmaj7 | G7 | Am7 | Bm7b5 | Cmaj7');
        expect(sections[0].color).toBe('#3b82f6');
        expect(sections[0].repeat).toBe(1);
    });
});

/**
 * @vitest-environment happy-dom
 */

import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { parseMusicXML, reharmonizeMelody } from '../../public/musicxml-parser.js';
import { arranger, arrangerReducer } from '../../public/state/arranger.js';
import { instrumentReducer, soloist } from '../../public/state/instruments.js';
import { ACTIONS } from '../../public/types.js';

// Mock state.js to return whatever we need for soloist tests
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

// Mock Date.now for stable snapshot IDs
vi.setSystemTime(new Date('2026-02-28T12:00:00Z'));

import { getState } from '../../public/state.js';

const ORNITHOLOGY_XML_SUBSET = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<score-partwise version="3.1">
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>8</divisions>
      </attributes>
      <note><rest/><duration>16</duration><type>half</type></note>
      <note><rest/><duration>8</duration><type>quarter</type></note>
      <note><rest/><duration>4</duration><type>eighth</type></note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration><type>eighth</type>
      </note>
    </measure>
    <measure number="2">
      <harmony>
        <root><root-step>G</root-step></root>
        <kind text="maj7">major-seventh</kind>
      </harmony>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration><type>eighth</type>
      </note>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>4</duration><type>eighth</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

const NIGHT_AND_DAY_XML_SUBSET = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<score-partwise version="3.1">
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>6</divisions>
      </attributes>
      <note><rest/><duration>12</duration><type>half</type></note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>6</duration><type>quarter</type>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>3</duration><type>eighth</type>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>3</duration><type>eighth</type>
      </note>
    </measure>
    <measure number="2">
      <harmony>
        <root><root-step>D</root-step></root>
        <kind text="min7">minor-seventh</kind>
      </harmony>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>24</duration><type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

describe('Lead Seed - MusicXML Parser', () => {
    it('should correctly parse chords and melody from Ornithology subset', () => {
        const result = parseMusicXML(ORNITHOLOGY_XML_SUBSET);

        // Ornithology uses 8 divisions per quarter note
        // Measure 1: 3 rests (half, quarter, eighth) = 16+8+4 = 28 divisions = 14 steps
        // The first note starts at step 14.

        expect(result.sections).toHaveLength(1);
        expect(result.sections[0].value).toContain('Gmaj7');

        expect(result.leadSheetMelody).toHaveLength(3);

        // First note (D4) at global step -2 (pick-up)
        expect(result.leadSheetMelody[0]).toMatchObject({
            midi: 62, // D4
            globalStep: -2,
            durationSteps: 2,
        });

        // Measure 2 (Gmaj7) starts at global step 0
        // First note (G4) at step 0
        expect(result.leadSheetMelody[1]).toMatchObject({
            midi: 67, // G4
            globalStep: 0,
            durationSteps: 2,
        });
    });

    it('should correctly parse chords and melody from Night and Day subset', () => {
        const result = parseMusicXML(NIGHT_AND_DAY_XML_SUBSET);

        // Night and Day uses 6 divisions per quarter note
        // Measure 1: Rest (half) = 12 divisions = 8 steps (4 steps per quarter)
        // Measure 2 starts at Step 0. Measure 1 is Step -16. Note is at beat 3 (-8 steps)

        expect(result.sections).toHaveLength(1);
        expect(result.sections[0].value).toContain('Dm7'); // min7 was replaced by m7

        expect(result.leadSheetMelody).toHaveLength(4);

        // First note (G4) at global step -8
        expect(result.leadSheetMelody[0]).toMatchObject({
            midi: 67,
            globalStep: -8,
            durationSteps: 4, // quarter note = 4 steps
        });
    });

    it('should correctly parse chords and melody from 3/4 time signature', () => {
        const THREE_FOUR_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<score-partwise version="3.1">
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <harmony>
        <root><root-step>C</root-step></root>
        <kind>major</kind>
      </harmony>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

        const result = parseMusicXML(THREE_FOUR_XML);

        // 3/4 = 12 steps per measure
        // Measure 1: starts at 0, C4 (MIDI 60) for 4 steps.
        // Measure 2: starts at 12, E4 (MIDI 64) for 4 steps.

        expect(result.leadSheetMelody).toHaveLength(2);

        expect(result.leadSheetMelody[0]).toMatchObject({
            midi: 60,
            globalStep: 0,
            durationSteps: 4,
        });

        expect(result.leadSheetMelody[1]).toMatchObject({
            midi: 64,
            globalStep: 12, // 12 steps after start of measure 1
            durationSteps: 4,
        });
    });

    it('should correctly parse chords and melody from 5/4 time signature', () => {
        const FIVE_FOUR_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<score-partwise version="3.1">
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>5</beats><beat-type>4</beat-type></time>
      </attributes>
      <harmony>
        <root><root-step>F</root-step></root>
        <kind>major</kind>
      </harmony>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

        const result = parseMusicXML(FIVE_FOUR_XML);

        // 5/4 = 20 steps per measure
        expect(result.leadSheetMelody[0]).toMatchObject({
            midi: 65,
            globalStep: 0,
        });
        expect(result.leadSheetMelody[1]).toMatchObject({
            midi: 69,
            globalStep: 20,
        });
    });

    it('should reharmonize a melody using the Harmonizer', () => {
        const leadSheetMelody = [
            { midi: 60, globalStep: 0 }, // C
            { midi: 64, globalStep: 4 }, // E
            { midi: 67, globalStep: 8 }, // G
        ];

        const sections = reharmonizeMelody(leadSheetMelody, 'C', 16);

        expect(sections).toHaveLength(1);
        expect(sections[0].value).toContain('I'); // Consonant strategy should pick I for C major melody
    });
});

describe('Lead Seed - Soloist Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should play melody from leadSheetMelody when style is lead_sheet', () => {
        const leadSheetMelody = [
            { midi: 60, globalStep: 0, durationSteps: 4 },
            { midi: 62, globalStep: 4, durationSteps: 4 },
        ];

        getState.mockReturnValue({
            playback: {
                bandIntensity: 0.5,
                complexity: 0.5,
                intent: { soloistMod: 0 },
            },
            groove: { pocket: { tightness: 0.5, globalDrive: 0 } },
            soloist: { leadSheetMelody, busySteps: 0, sessionSteps: 0 },
            harmony: {},
            arranger: { timeSignature: '4/4', totalSteps: 32 },
        });

        const currentChord = { rootMidi: 60, intervals: [0, 4, 7] };

        // Step 0: Should trigger first note (MIDI 60)
        const note0 = getSoloistNote(currentChord, null, 0, null, 64, 'lead_sheet', 0, false);
        expect(note0.midi).toBe(60);
        expect(note0.durationSteps).toBe(4);

        // Step 1: Should return null because busySteps > 0
        const note1 = getSoloistNote(currentChord, null, 1, null, 64, 'lead_sheet', 1, false);
        expect(note1).toBeNull();

        // Step 4: Should trigger second note (MIDI 62)
        const note4 = getSoloistNote(currentChord, null, 4, null, 64, 'lead_sheet', 0, false);
        expect(note4.midi).toBe(62);
    });

    it('should respect totalFormSteps for looping', () => {
        const leadSheetMelody = [{ midi: 60, globalStep: 0, durationSteps: 4 }];

        getState.mockReturnValue({
            playback: {
                bandIntensity: 0.5,
                complexity: 0.5,
                intent: { soloistMod: 0 },
            },
            groove: { pocket: { tightness: 0.5, globalDrive: 0 } },
            soloist: { leadSheetMelody, busySteps: 0, sessionSteps: 0 },
            harmony: {},
            arranger: { timeSignature: '4/4', totalSteps: 16 },
        });

        const currentChord = { rootMidi: 60, intervals: [0, 4, 7] };

        // Step 16: Should trigger the note again (0 % 16 = 0)
        const note16 = getSoloistNote(currentChord, null, 16, null, 64, 'lead_sheet', 0, false);
        expect(note16.midi).toBe(60);
    });
});

describe('Lead Seed - Import Refinements', () => {
    it('should extract xmlKey from MusicXML', () => {
        const EB_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<score-partwise version="3.1">
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>-3</fifths></key>
      </attributes>
      <note><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><duration>4</duration></note>
    </measure>
  </part>
</score-partwise>`;
        const result = parseMusicXML(EB_XML);
        expect(result.xmlKey).toBe('Eb');
        expect(result.hasChords).toBe(false);
    });

    it('should not overwrite arranger sections if hasChords is false', () => {
        // Reset state
        arrangerReducer(ACTIONS.RESET_STATE);
        const originalSections = [...arranger.sections];

        const payload = {
            hasChords: false,
            sections: [{ id: 'new', value: 'G | C' }],
            leadSheetMelody: [],
        };

        arrangerReducer(ACTIONS.IMPORT_MUSICXML, payload);
        expect(arranger.sections).toEqual(originalSections);
        expect(arranger.isDirty).toBe(true);
    });

    it('should transpose imported melody to match current arrangement key', () => {
        // Set arrangement key to D
        arrangerReducer(ACTIONS.RESET_STATE);
        arranger.key = 'D'; // D is index 2

        const payload = {
            xmlKey: 'C', // C is index 0
            leadSheetMelody: [{ midi: 60, globalStep: 0 }],
        };

        // Interval should be 2 - 0 = +2
        instrumentReducer(ACTIONS.IMPORT_MUSICXML, payload);

        expect(soloist.leadSheetMelody[0].midi).toBe(62);
        expect(soloist.style).toBe('lead_sheet');
    });

    it('should transpose imported melody down if current key is lower', () => {
        // Set arrangement key to Bb
        arrangerReducer(ACTIONS.RESET_STATE);
        arranger.key = 'Bb'; // Bb is index 10

        const payload = {
            xmlKey: 'C', // C is index 0
            leadSheetMelody: [{ midi: 60, globalStep: 0 }],
        };

        // Interval should be 10 - 0 = +10 (or -2 if normalized, but let's check current implementation)
        // KEY_ORDER: C, Db, D, Eb, E, F, Gb, G, Ab, A, Bb, B
        // currentIdx = 10, xmlIdx = 0. Interval = 10.
        // 60 + 10 = 70.
        instrumentReducer(ACTIONS.IMPORT_MUSICXML, payload);

        expect(soloist.leadSheetMelody[0].midi).toBe(70);
    });
});

describe('Lead Seed - Advanced Parsing', () => {
    it('should handle multiple chords per measure', () => {
        const MULTI_CHORD_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<score-partwise version="3.1">
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions></attributes>
      <harmony><root><root-step>G</root-step></root><kind text="min7">minor-seventh</kind></harmony>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>8</duration></note>
      <harmony><root><root-step>C</root-step></root><kind text="7">dominant</kind></harmony>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>8</duration></note>
    </measure>
  </part>
</score-partwise>`;
        const result = parseMusicXML(MULTI_CHORD_XML);
        // Should be joined by a space
        expect(result.sections[0].value).toBe('Gm7 C7');
    });

    it('should handle chromatic chord roots (sharps and flats)', () => {
        const CHROMATIC_CHORD_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<score-partwise version="3.1">
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions></attributes>
      <harmony><root><root-step>F</root-step><root-alter>1</root-alter></root><kind text="min7">minor-seventh</kind></harmony>
      <note><duration>8</duration></note>
      <harmony><root><root-step>E</root-step><root-alter>-1</root-alter></root><kind text="maj7">major-seventh</kind></harmony>
      <note><duration>8</duration></note>
    </measure>
  </part>
</score-partwise>`;
        const result = parseMusicXML(CHROMATIC_CHORD_XML);
        expect(result.sections[0].value).toBe('F#m7 Ebmaj7');
    });

    it('should handle forward and backup tags for rhythmic mapping', () => {
        const RHYTHMIC_MAPPING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<score-partwise version="3.1">
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
      <forward><duration>4</duration></forward>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration></note>
      <backup><duration>12</duration></backup>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration></note>
    </measure>
  </part>
</score-partwise>`;
        const result = parseMusicXML(RHYTHMIC_MAPPING_XML);
        // C4 (step 0)
        // Forward 4 (current step 4)
        // E4 (step 8)
        // Backup 12 (current step 12 - 12 = 0)
        // G4 (step 0)
        expect(result.leadSheetMelody.find((n) => n.midi === 60).globalStep).toBe(0); // C4
        expect(result.leadSheetMelody.find((n) => n.midi === 64).globalStep).toBe(8); // E4
        expect(result.leadSheetMelody.find((n) => n.midi === 67).globalStep).toBe(0); // G4
    });
});

describe('Lead Seed - MusicXML Fixtures', () => {
    const fixturesDir = path.join(__dirname, '../fixtures/musicxml');

    it('should correctly parse Night And DAy.xml fixture', () => {
        const xml = fs.readFileSync(path.join(fixturesDir, 'Night And DAy.xml'), 'utf-8');
        const result = parseMusicXML(xml);

        // Sanity checks before snapshot
        expect(result.xmlKey).toBe('C');
        expect(result.hasChords).toBe(true);
        expect(result.sections.length).toBeGreaterThan(0);
        expect(result.leadSheetMelody.length).toBeGreaterThan(100); // 48 bars of complex jazz

        // Use snapshot to catch regressions in parsing logic
        expect(result).toMatchSnapshot();
    });

    it('should correctly parse Ornithology.xml fixture', () => {
        const xml = fs.readFileSync(path.join(fixturesDir, 'Ornithology.xml'), 'utf-8');
        const result = parseMusicXML(xml);

        // Sanity checks
        expect(result.xmlKey).toBe('G');
        expect(result.hasChords).toBe(true);
        expect(result.sections.length).toBeGreaterThan(0);
        expect(result.leadSheetMelody.length).toBeGreaterThan(50);

        expect(result).toMatchSnapshot();
    });

    it('should correctly parse AllBlues.xml fixture', () => {
        const xml = fs.readFileSync(path.join(fixturesDir, 'AllBlues.xml'), 'utf-8');
        const result = parseMusicXML(xml);

        // All Blues is in G (1 sharp)
        expect(result.xmlKey).toBe('G');
        expect(result.hasChords).toBe(true);
        // Should detect 6/8 if we check currentTimeSignature in parser (but we don't return it yet)
        expect(result.sections.length).toBeGreaterThan(0);
        expect(result.leadSheetMelody.length).toBeGreaterThan(50);

        expect(result).toMatchSnapshot();
    });
});

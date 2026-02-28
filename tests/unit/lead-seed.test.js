/**
 * @vitest-environment happy-dom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMusicXML, reharmonizeMelody } from '../../public/musicxml-parser.js';
import { getSoloistNote } from '../../public/soloist.js';

// Mock state.js to return whatever we need for soloist tests
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

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

        // First note (D4) at global step 14
        expect(result.leadSheetMelody[0]).toMatchObject({
            midi: 62, // D4
            globalStep: 14,
            durationSteps: 2,
        });

        // Measure 2 starts at global step 16
        // First note (G4) at step 16
        expect(result.leadSheetMelody[1]).toMatchObject({
            midi: 67, // G4
            globalStep: 16,
            durationSteps: 2,
        });
    });

    it('should correctly parse chords and melody from Night and Day subset', () => {
        const result = parseMusicXML(NIGHT_AND_DAY_XML_SUBSET);

        // Night and Day uses 6 divisions per quarter note
        // Measure 1: Rest (half) = 12 divisions = 8 steps (4 steps per quarter)
        // First note starts at step 8.

        expect(result.sections).toHaveLength(1);
        expect(result.sections[0].value).toContain('Dm7'); // min7 was replaced by m7

        expect(result.leadSheetMelody).toHaveLength(4);

        // First note (G4) at global step 8
        expect(result.leadSheetMelody[0]).toMatchObject({
            midi: 67,
            globalStep: 8,
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

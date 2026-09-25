// cspell:ignore downpicked downpicking pitchless
import type { BandEvent, DrumHit, PitchedNote } from '../../core/types.js';
import { chordAt, type Timeline } from '../../form/timeline.js';
import { STEP } from '../../players/grid.js';
import { fifthOf } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';
import { defineClaims, type Metric } from '../critique/harness.js';

// ---------------------------------------------------------------- metal's own metrics
const stepOf = (t: Timeline, e: BandEvent) => Math.round((e.tick - t.bars[e.bar].start) / STEP);
const ratio = (hits: number, total: number) => (total ? hits / total : 0);

/** 4/4 bars playing time: no toms (a fill), not a phrase's last bar, not a section's first. */
function timeBars(t: Timeline, events: BandEvent[]) {
    return t.bars.filter((b) => {
        const drums = events.filter((e): e is DrumHit => e.lane === 'drums' && e.bar === b.index);
        return (
            b.meter.name === '4/4' &&
            drums.length > 0 &&
            !drums.some((d) => d.piece.startsWith('tom')) &&
            b.phrase.bar !== b.phrase.length - 1 &&
            b.barInVisit > 0
        );
    });
}

function steps(t: Timeline, events: BandEvent[], bar: number, pieces: string[]) {
    return new Set(
        events
            .filter(
                (e): e is DrumHit =>
                    e.lane === 'drums' && e.bar === bar && pieces.includes(e.piece),
            )
            .map((e) => stepOf(t, e)),
    );
}

/** Every comp strike (sounding or palm-muted) by onset. */
function compStrikes(events: BandEvent[]) {
    const out = new Map<number, PitchedNote[]>();
    for (const e of events) {
        if (e.lane === 'comp') {
            out.set(e.tick, [...(out.get(e.tick) ?? []), e]);
        }
    }
    return out;
}

/** Root lowest, and nothing but the chord's root and its own fifth: R-5-8. */
function isPower(t: Timeline, notes: PitchedNote[]): boolean {
    const chord = chordAt(t, notes[0].tick);
    if (!chord || notes.length < 2) {
        return false;
    }
    const fifth = mod12(chord.root + fifthOf(chord));
    const pcs = notes.map((n) => mod12(n.midi));
    return (
        mod12(Math.min(...notes.map((n) => n.midi))) === chord.root &&
        // A #5 chord is played as root + octave alone (see `voicingTones`' power kind).
        (pcs.includes(fifth) || fifthOf(chord) === 8) &&
        pcs.every((pc) => pc === chord.root || pc === fifth)
    );
}

/** Per 4/4 bar, the steps where the comp strikes (sounding or palm-muted). */
function compStepsByBar(t: Timeline, events: BandEvent[]) {
    const bars = new Map<number, Set<number>>();
    for (const e of events) {
        if (e.lane === 'comp' && t.bars[e.bar].meter.name === '4/4') {
            bars.set(e.bar, (bars.get(e.bar) ?? new Set()).add(stepOf(t, e)));
        }
    }
    return bars;
}

/** The beats (as steps) played as a gallop: the beat, its "and" and its "a", not its "e". */
function gallops(s: Set<number>): number[] {
    return [0, 4, 8, 12].filter((b) => s.has(b) && s.has(b + 2) && s.has(b + 3) && !s.has(b + 1));
}

/** Groove bars whose snare plays a blast (the offbeat sixteenths of beats 1 and 2). */
function isBlast(t: Timeline, events: BandEvent[], bar: number) {
    const snare = steps(t, events, bar, ['snare']);
    return [1, 3, 5, 7].every((s) => snare.has(s));
}

const metrics = {
    /**
     * Share of sounding comp strikes that are power chords of the chord they sound over. Reads
     * high almost by construction — `isPower` re-derives the same `fifthOf` the voicing was
     * built from, so most strikes trivially match it. What it actually guards is the one thing
     * that *can* drift: the lowest note sitting on the chord's root (or slash bass) rather than
     * some other tone, which a slash chord or a voice-leading bug could still get wrong.
     */
    compPowerChordShare: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const notes of compStrikes(events).values()) {
                if (notes[0].muted) {
                    continue;
                }
                n++;
                hit += isPower(t, notes) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * Share of comp strikes that are palm-muted power chords: a damped *grip* that keeps its
     * pitch (`palm`), root and fifth under the palm — never a pitchless scratch (`muted`), and
     * never a one-note or non-power strike either.
     */
    compPalmMuteShare: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const notes of compStrikes(events).values()) {
                n++;
                hit += notes.every((x) => x.palm && !x.muted) && isPower(t, notes) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of comp strikes (chugs included) that land with a bass note: one riff, two players. */
    compBassUnison: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { events } of takes) {
            const bass = new Set(events.filter((e) => e.lane === 'bass').map((e) => e.tick));
            for (const tick of compStrikes(events).keys()) {
                n++;
                hit += bass.has(tick) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * Downpicking: of the comp strikes on an eighth (an even sixteenth), the share that are
     * downstrokes. An alternate-picked eighth line scores about half.
     */
    compEighthDownstrokes: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const notes of compStrikes(events).values()) {
                if (stepOf(t, notes[0]) % 2 !== 0 || !notes[0].stroke) {
                    continue;
                }
                n++;
                hit += notes[0].stroke === 'down' ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * The gallop is the feet's and the hands' together: of the beats where the guitar gallops
     * (a strike on the beat, its "and" and its "a", none on its "e"), the share where the kick
     * gallops the same beat. `gallopBeats` counts them, so a take with no gallop can't pass this
     * vacuously.
     */
    compGallopWithKick: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const [bar, s] of compStepsByBar(t, events)) {
                const kick = steps(t, events, bar, ['kick']);
                for (const b of gallops(s)) {
                    n++;
                    hit += gallops(kick).includes(b) ? 1 : 0;
                }
            }
        }
        return ratio(hit, n);
    },
    /** Guitar gallop beats per 4/4 bar. */
    gallopBeats: (takes) => {
        let n = 0;
        let beats = 0;
        for (const { timeline: t, events } of takes) {
            for (const s of compStepsByBar(t, events).values()) {
                n++;
                beats += gallops(s).length;
            }
        }
        return ratio(beats, n);
    },
    /** Kick onsets per sixteenth in groove bars: 0.5 is straight eighths, 1 the double kick. */
    kickDensity: (takes) => {
        let n = 0;
        let kicks = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of timeBars(t, events)) {
                n += 16;
                kicks += steps(t, events, b.index, ['kick']).size;
            }
        }
        return ratio(kicks, n);
    },
    /**
     * Share of groove bars (blast bursts aside) whose snare is the backbeat (2 and 4) or half
     * time (3 alone): one or the other, every bar.
     */
    snareBackbeatOrHalf: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of timeBars(t, events)) {
                if (isBlast(t, events, b.index)) {
                    continue;
                }
                n++;
                const s = [...steps(t, events, b.index, ['snare', 'rim'])]
                    .sort((x, y) => x - y)
                    .join(',');
                hit += s === '4,12' || s === '8' ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of groove bars in half time: the snare (or cross-stick) on 3 and nowhere else. */
    snareHalfTime: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of timeBars(t, events)) {
                n++;
                const s = [...steps(t, events, b.index, ['snare', 'rim'])].join(',');
                hit += s === '8' ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of groove bars that blast. */
    blastBars: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of timeBars(t, events)) {
                n++;
                hit += isBlast(t, events, b.index) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /** Share of groove bars with a crash on the One (the china/crash accent on a riff's One). */
    crashOnOne: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const b of timeBars(t, events)) {
                n++;
                hit += steps(t, events, b.index, ['crash']).has(0) ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
    /**
     * The bass follows the feet: of the kicks in groove bars, the share with a bass note on
     * them. (`bassKickUnison` asks the converse — whether the bass's notes are on kicks — and an
     * eighth-note bass under a double kick passes that while missing every burst.)
     */
    kickWithBass: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const bass = new Set(events.filter((e) => e.lane === 'bass').map((e) => e.tick));
            for (const b of timeBars(t, events)) {
                for (const k of steps(t, events, b.index, ['kick'])) {
                    n++;
                    hit += bass.has(b.start + k * STEP) ? 1 : 0;
                }
            }
        }
        return ratio(hit, n);
    },
    /** Share of sounding bass notes on the chord's bass note: no passing tones under the riff. */
    bassOnChordBass: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            for (const e of events) {
                if (e.lane !== 'bass' || e.muted) {
                    continue;
                }
                const chord = chordAt(t, e.tick);
                if (!chord) {
                    continue;
                }
                n++;
                hit += mod12(e.midi) === chord.bass ? 1 : 0;
            }
        }
        return ratio(hit, n);
    },
} satisfies Record<string, Metric>;

export const metal = defineClaims({
    metrics,
    takes: [
        {
            // Metal's own instrument, with the energy following the form.
            take: { comp: 'guitar' },
            claims: [
                ['kickOnOne', 0.95, 1, 'the kick owns the One'],
                ['kickConsistency', 0.75, 1, 'a section keeps its kick pattern'],
                [
                    'snareBackbeatOrHalf',
                    0.95,
                    1,
                    'the snare is the backbeat or half time, the section decides which',
                ],
                [
                    'compPowerChordShare',
                    0.95,
                    1,
                    'power chords, never a distorted third: root and its own fifth',
                ],
                [
                    'compPalmMuteShare',
                    0.45,
                    0.9,
                    'most strokes are palm-muted power chords, damped grips rather than scratches',
                ],
                ['compMeanLowest', 40, 48, 'down on the E and A strings: E2 and A2 are the sound'],
                [
                    'compBassUnison',
                    0.9,
                    1,
                    'the guitar and the bass play one riff: every chug lands with a bass note',
                ],
                ['bassArrivesOnBass', 0.95, 1, 'every change arrives on its root (or slash note)'],
                [
                    'bassOnChordBass',
                    0.98,
                    1,
                    'locked to the power chord: no passing tones rubbing under the riff',
                ],
                ['bassMeanPitch', 30, 36, 'the low E string: an octave under the guitar'],
            ],
        },
        {
            take: { comp: 'guitar', intensity: 0.9 },
            claims: [
                ['kickDensity', 0.75, 1, 'the double kick: bursts, gallops and runs of sixteenths'],
                ['bassKickUnison', 0.9, 1, 'the bass plays with the kick'],
                [
                    'kickWithBass',
                    0.95,
                    1,
                    "and follows the feet: every double-kick burst and gallop is the bass's too",
                ],
                ['compEighthDownstrokes', 0.97, 1, 'every eighth downpicked when the band drives'],
                ['gallopBeats', 0.3, 2, 'some sections gallop'],
                [
                    'compGallopWithKick',
                    0.95,
                    1,
                    'the guitar gallops only with the kick: one rhythm, hands and feet',
                ],
                ['crashOnOne', 0.62, 1, "the crash marks the riff's One"],
                ['blastBars', 0.03, 0.2, 'a blast is a burst at the peak, not the groove'],
                ['snareBackbeatOrHalf', 0.95, 1, 'outside a burst, the backbeat or half time'],
            ],
        },
        {
            take: { comp: 'guitar', intensity: 0.6 },
            claims: [
                [
                    'kickDensity',
                    0.15,
                    0.55,
                    'no double kick yet: heavy patterns and driving eighths',
                ],
                ['blastBars', 0, 0, 'no blasting below the peak'],
                [
                    'crashOnOne',
                    0,
                    0.2,
                    "the riff's crash accent is the driving band's; here only after a fill",
                ],
                [
                    'compPalmMuteShare',
                    0.55,
                    0.9,
                    'palm-muted eighth chugs, the power chord ringing open on accents',
                ],
                [
                    'compEighthDownstrokes',
                    0.95,
                    1,
                    'downpicked eighth chugs for weight, same as the driving band above it',
                ],
                [
                    'bassNotesPerBeat',
                    1.8,
                    2.3,
                    'root eighths under the chug (the chorus drives on)',
                ],
            ],
        },
        {
            take: { comp: 'guitar', intensity: 0.2 },
            claims: [
                ['snareHalfTime', 0.95, 1, 'a quiet band is half time: the snare on 3 alone'],
                ['compPalmMuteShare', 0, 0.02, 'no chugs: each power chord rings'],
                ['compStrikesPerBar', 0.8, 2, 'one ringing chord per change'],
                ['bassNotesPerBeat', 0.3, 1, 'long roots with the kick, not a chug'],
            ],
        },
        {
            take: { comp: 'guitar', bass: false },
            claims: [
                ['compPowerChordShare', 0.95, 1, 'with no bassist it is still power chords'],
                ['compMeanLowest', 40, 48, 'and still down low: the guitar is the bottom'],
            ],
        },
        {
            take: { comp: 'piano', intensity: 0.6 },
            claims: [
                [
                    'compPowerChordShare',
                    0.95,
                    1,
                    'the keys double the guitar: power voicings, root-5-8',
                ],
                ['compStrikesPerBar', 1, 3.2, 'stabs only on the accents, never the chug'],
            ],
        },
        {
            take: { lead: 'head' },
            claims: [
                ['leadLongBreath', 0, 0.02, 'the melody never drops out for two bars'],
                ['leadRestShare', 0, 0.15, 'the twin-guitar melody fills the form'],
                ['leadNotesPerBar', 3.5, 7, "a melody in the riff's gallop"],
                ['leadInnerSpace', 0, 0.1, 'the gallop fills the bar'],
                ['leadShortShare', 0.55, 0.9, 'eighths and sixteenths, a held note to land'],
                ['leadChordToneOnBeats', 0.8, 1, 'the melody sits on the chord on the beats'],
                ['leadChangeRootFifth', 0.4, 0.75, 'roots and 5ths, like the power chords'],
                ['leadPhraseEndsOnChordTone', 0.95, 1, 'phrases resolve'],
                ['leadBendShare', 0.03, 0.2, 'bent landings'],
                ['leadLeapShare', 0, 0.05, 'no wide leaps inside a phrase'],
                ['leadRepeatedNotes', 0, 0.06, 'the line moves'],
                ['leadOscillation', 0, 0.05, 'no trilling back and forth'],
            ],
        },
        {
            take: { lead: 'solo' },
            claims: [
                ['leadLongBreath', 0, 0.12, 'breaths, not gaps: two empty bars are rare'],
                ['leadRestShare', 0.1, 0.35, 'relentless: it breathes, it does not wait'],
                ['leadNotesPerBar', 4.5, 9, 'shred: the busiest solo in the band'],
                ['leadShortShare', 0.8, 1, 'sixteenth runs'],
                ['leadInnerSpace', 0, 0.15, 'the runs fill the bar'],
                ['leadChordToneOnBeats', 0.75, 1, 'the runs keep the chord on the beats'],
                ['leadChangeRootFifth', 0.4, 0.8, 'changes land on roots and 5ths'],
                [
                    'leadChangeGuideTones',
                    0.25,
                    0.6,
                    "with the 3rd for colour (the V's raised leading tone)",
                ],
                ['leadChromaticApproach', 0.05, 0.3, 'chromatic passing notes in the runs'],
                ['leadBendShare', 0.02, 0.2, 'the held landings bent up a whole step'],
                ['leadStepShare', 0.5, 0.85, 'scale runs: mostly steps'],
                ['leadLeapShare', 0, 0.05, 'a wide leap is rare'],
                ['leadRepeatedNotes', 0, 0.05, 'no stuttering on one pitch'],
                ['leadOscillation', 0, 0.05, 'no mechanical trills'],
                ['leadPhraseEndsOnChordTone', 0.9, 1, 'phrases resolve'],
                ['leadArcRise', 1.5, 4, 'the solo builds to the shred'],
                ['leadPeakIsTop', 0.85, 1, 'the peak chorus holds the top note'],
                ['leadRange', 12, 26, 'the solo climbs the neck'],
            ],
        },
    ],
});

// @ts-nocheck
// cspell:ignore Cmaj Cdim Caug
/**
 * HARMONY-LANE WRITTEN-FIFTH SWEEP (#1348)
 *
 * The chord series #1313 → #1344 made four lanes honour a written altered 5th: the
 * parse voicing, the live comp, the soloist/bass target tones, and the scale. The
 * HARMONY lane (`getHarmonyNotes`) is the fifth, and nobody had checked it — it
 * FABRICATES a perfect fifth by construction in four per-genre voicing overrides
 * (`applyGenreVoicingOverride`), each gated only on `!isTensionChord`:
 *
 *   - Blues   `hornSection`      → `[3, 7, 0]` / `[4, 7, 0]`  (interval 7 stated)
 *   - Metal   `powerChord`       → `[0, 7, 12]`, then rebuilt as `[root, root+7, root+12]`
 *   - Rock    `harmonizedThirds` → `[third, 7]` / `[0, 7]` / `[0, 7, 12]`
 *   - Country `pedalSteelSwell`  → `[0, 4, 9]` (a fabricated major 3rd + 6th, no 5th)
 *
 * …plus one non-genre site: the guide-tone fallback `intervals = rootlessComping ? [7]
 * : [0, 7]` when a chord has no guide tone to reduce to.
 *
 * The one rule behind the whole series: a written chord may be voiced as a SUBSET of
 * itself, never with a tone that CONTRADICTS a written one. So over a written
 * `Cmaj7b5` the horns must not punch G♮ against the comp's G♭, and over `Cm#5` not
 * G♮ against A♭.
 *
 * SHAPE OF THE GUARD — it is keyed on a PREDICATE, not a hand-kept list. The swept
 * qualities are derived by running `chordHasPerfectFifth` (`public/utils.ts`, the same
 * predicate the bass fifth-slot lane reads) over a corpus of chart spellings, so the
 * next quality added with an altered 5th is swept the moment its spelling parses —
 * which is what stops this structural hole reopening. `mb6` is deliberately NOT swept:
 * its perfect 5th is WRITTEN, so a harmony voice on degree 7 is the chart's own tone.
 *
 * Two anti-vacuity guards, because "assert no degree 7 anywhere" is trivially true of
 * a harness that emits nothing:
 *   1. every genre × spelling cell must emit at least one note somewhere in the sweep;
 *   2. a CONTROL row — plain `C` in the hornSection genre — must SOUND degree 7, so we
 *      know the probe can see a fifth at all.
 *
 * SCOPE NOTE (deliberate): the sweep drives the steady-state voicing path, not the
 * Shadow-mode latch/bloom highlights. Those need a `coordination.soloistSeed`, and
 * their one interval-7 site is the latch's `relativeSeedInterval` — harmony DOUBLING
 * the soloist's own note. That is the soloist lane's tone to own (already guarded by
 * `chordTargetTones`, #1336/#1340), not a fifth the harmony lane invented.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { canonToFeel, GENRE_NAMES } from '../../public/data/smart-genres.js';
import { getChordDetails } from '../../public/engine/chords-engine.js';
import { clearHarmonyMemory, getHarmonyNotes } from '../../public/engine/harmonies.js';
import { resolveHarmonyProfile } from '../../public/engine/harmony-styles.js';
import { BASS_SPACE_FEELS } from '../../public/engine/voicing-policy.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { chordHasPerfectFifth, getStepInfo } from '../../public/utils.js';
import { voice } from '../utils/voicing-probe.js';

/**
 * Chart spellings, not qualities — the sweep goes through the real parser so a row can
 * never claim a quality the chart cannot produce. Both members of the triad/seventh
 * pairs are present (`aug`/`aug7`, `dim`/`dim7`) because those two share one quality
 * string and differ only in `is7th`, which changes the intervals the lane starts from.
 *
 * The bottom block is the perfect-fifth CONTROL set: every one of them must be filtered
 * OUT by the predicate below, which is what pins that the sweep isn't silently
 * over-reaching onto chords whose natural 5 is written (`mb6` above all — #1348 puts it
 * explicitly out of scope, and the 6th-chord family is excluded by the same precedent).
 */
const CORPUS = [
    'maj7b5',
    'm#5',
    'm7#5',
    'aug',
    'aug7',
    '7#5',
    'maj7#5',
    '7b5',
    '7alt',
    'dim',
    'dim7',
    'm7b5',
    '9b5',
    '7#9#5',
    // perfect-fifth controls — must NOT be swept
    '',
    'm',
    'm7',
    '7',
    'maj7',
    'm6',
    '6',
    'sus4',
    '7sus4',
    'add9',
    'mb6',
    '7b9',
    '7#9',
    '7#11',
    'mMaj7',
];

const qualityOf = (spelling) => getChordDetails(spelling).quality;
const SWEPT = CORPUS.filter((spelling) => !chordHasPerfectFifth(qualityOf(spelling)));
const NOT_SWEPT = CORPUS.filter((spelling) => chordHasPerfectFifth(qualityOf(spelling)));

const GENRES = GENRE_NAMES.map((name) => ({ name, feel: canonToFeel(name) }));
const INTENSITIES = [0.35, 0.9]; // below HARMONY_PAD_CEILING (sea/pad) and well above it (comp/stab)
const TS = TIME_SIGNATURES['4/4'];

/**
 * Two coordination shapes, because `finalizeHarmonyNotes` takes a different reduction
 * path in each and the genre override runs at the end of BOTH:
 *   - resting: the lane voices the chord itself (the horn stab / power chord / pedal
 *     steel / harmonized-3rd line all land here);
 *   - busy: the soloist and the comper are both hitting, so the lane thins to guide
 *     tones — the path that reaches the `[0, 7]` guide-tone fallback.
 */
const COORDINATIONS = [
    { label: 'resting', base: { soloistResting: true, soloistNotesInPhrase: 0 } },
    {
        label: 'busy',
        base: {
            soloistResting: false,
            soloistBusy: true,
            soloistActive: false,
            soloistNotesInPhrase: 5,
            accompanimentHit: true,
        },
    },
];

/** Root-relative pitch class: 7 is the natural (perfect) fifth. */
const degree = (midi, rootMidi) => (((Math.round(midi) - rootMidi) % 12) + 12) % 12;

/**
 * Parse a 4-bar chart of `C<spelling>` through the real `validateProgression` (via the
 * shared `voice()` probe, so the harmony sweep and the comp matrix agree on what a
 * written chord IS), then drive the harmony lane over 4 bars x 2 laps.
 *
 * 4 bars because `sectionBarIndex` keys the Rock 3rd-vs-6th alternation and the Blues
 * stab figure; 2 laps because the lane's `harmony.lastMidis` voice-leading memory and
 * the comper's `lastPlayedStep` yield gate only settle after the first pass.
 */
function sweep({ feel, spelling, bassOn, intensity, coordination }) {
    const symbol = `C${spelling}`;
    const chart = `${symbol} | ${symbol} | ${symbol} | ${symbol}`;
    voice(feel, bassOn, chart, 'C', intensity);
    const state = getState();
    state.harmony.enabled = true;
    state.soloist.enabled = true;
    clearHarmonyMemory(state);

    const progression = state.arranger.progression;
    const emitted = [];
    for (let lap = 0; lap < 2; lap++) {
        for (let bar = 0; bar < progression.length; bar++) {
            const chord = progression[bar];
            const nextChord = progression[(bar + 1) % progression.length];
            for (let mStep = 0; mStep < 16; mStep++) {
                const step = (lap * progression.length + bar) * 16 + mStep;
                state.playback.step = step;
                const notes = getHarmonyNotes(
                    state,
                    chord,
                    nextChord,
                    step,
                    60,
                    'smart',
                    mStep,
                    null,
                    { ...coordination, step, bassEffectiveEnabled: bassOn },
                    getStepInfo(step, TS),
                );
                for (const note of notes) {
                    if (note.midi > 0 && !note.muted) {
                        emitted.push({ midi: note.midi, rootMidi: chord.rootMidi, step });
                    }
                }
            }
        }
    }
    return { emitted, quality: progression[0].quality };
}

describe('Harmony lane honours a written altered fifth (#1348)', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
    });

    describe('the swept set is derived from chordHasPerfectFifth, not hand-listed', () => {
        it('covers every quality in the corpus whose triad has no perfect fifth', () => {
            const swept = new Set(SWEPT.map(qualityOf));
            // The nine qualities #1348 names. A parser change that stopped producing any of
            // them would silently shrink the sweep, so pin them as a floor, not a ceiling —
            // a NEW altered-fifth quality joins automatically via the predicate.
            for (const quality of [
                'maj7b5',
                'm#5',
                'm7#5',
                'aug',
                'augmaj7',
                '7b5',
                '7alt',
                'dim',
                'halfdim',
            ]) {
                expect(swept, `${quality} dropped out of the sweep`).toContain(quality);
            }
        });

        it('leaves every written-perfect-fifth quality out, mb6 included', () => {
            // mb6 ([0,3,7,8]) writes BOTH a natural 5 and a b6; a harmony voice on degree 7
            // is its own chord tone. Same precedent excludes the 6th-chord family.
            expect(NOT_SWEPT.map(qualityOf)).toContain('mb6');
            for (const spelling of NOT_SWEPT) {
                expect(chordHasPerfectFifth(qualityOf(spelling)), `C${spelling}`).toBe(true);
            }
        });

        it('sweeps all thirteen canon genres', () => {
            expect(GENRES).toHaveLength(13);
            for (const { name, feel } of GENRES) {
                expect(feel, `${name} has no runtime feel`).toBeTruthy();
            }
        });
    });

    // CONTROL: the probe must be able to SEE a fifth, or every assertion below is vacuous.
    // Blues is the hornSection profile, whose stab states root-3rd-5th over a plain major
    // triad ([4, 7, 0]) — exactly the shape that must NOT appear over an altered fifth.
    it('CONTROL — a plain C major in the hornSection genre does sound its fifth', () => {
        const hornFeel = GENRES.map(({ feel }) => feel).find(
            (feel) => resolveHarmonyProfile(feel).voicing?.hornSection,
        );
        expect(hornFeel, 'no genre carries the hornSection profile').toBeTruthy();
        let sawFifth = 0;
        let total = 0;
        for (const bassOn of [true, false]) {
            for (const intensity of INTENSITIES) {
                const { emitted } = sweep({
                    feel: hornFeel,
                    spelling: '',
                    bassOn,
                    intensity,
                    coordination: COORDINATIONS[0].base,
                });
                total += emitted.length;
                sawFifth += emitted.filter(
                    ({ midi, rootMidi }) => degree(midi, rootMidi) === 7,
                ).length;
            }
        }
        console.log(
            '\n--- HARMONY WRITTEN-FIFTH CONTROL ---\n' +
                `[Genre]          ${hornFeel} (hornSection)\n` +
                `[Emissions]      ${total}\n` +
                `[Natural 5ths]   ${sawFifth} (Target: > 0)\n` +
                '-------------------------------------\n',
        );
        expect(total, 'the control chord never sounded').toBeGreaterThan(0);
        expect(sawFifth, 'the probe cannot see a fifth at all').toBeGreaterThan(0);
    });

    const emissionsPerCell = new Map();

    describe.each(GENRES)('$name', ({ name, feel }) => {
        for (const { label, base } of COORDINATIONS) {
            it.each(INTENSITIES)(
                `never states a natural 5 over a written altered 5th (${label}, intensity %s)`,
                (intensity) => {
                    // Collect EVERY offending cell before asserting. A bare per-note
                    // `expect` aborts the case on the first violation, which hides both
                    // the rest of the red cells and the emission counts the vacuity
                    // guard below needs.
                    const offenders = [];
                    for (const spelling of SWEPT) {
                        for (const bassOn of [true, false]) {
                            const { emitted, quality } = sweep({
                                feel,
                                spelling,
                                bassOn,
                                intensity,
                                coordination: base,
                            });
                            const cell = `${name}|${spelling}`;
                            emissionsPerCell.set(
                                cell,
                                (emissionsPerCell.get(cell) || 0) + emitted.length,
                            );
                            const fifths = emitted.filter(
                                ({ midi, rootMidi }) => degree(midi, rootMidi) === 7,
                            );
                            if (fifths.length > 0) {
                                offenders.push(
                                    `C${spelling} (${quality}) in ${name} [${feel}], bass on: ${bassOn} @${intensity} (${label}): ${fifths.length} natural 5ths, first at step ${fifths[0].step} (midi ${fifths[0].midi})`,
                                );
                            }
                        }
                    }
                    expect(offenders, 'harmony fabricated a natural 5').toEqual([]);
                },
            );
        }
    });

    /**
     * The GROUNDING_QUALITIES half of #1348, and the reason the three new qualities go in
     * BOTH sets. Listing them as tension chords alone hands them the tension density cap
     * (2 voices, guide tones first) — correct over a sounding bass, but with the bass
     * MUTED the player is covering that part, and a bare 3rd+7th dyad under a written
     * `Cmaj7b5` states no root at all. `shouldPreferGroundedVoicing` is what bypasses that
     * cap and puts the root back first (`selectGroundedIntervals`), and it only consults
     * `GROUNDING_QUALITIES` — so this is the assertion that goes red if the grounding half
     * is dropped while the tension half stays.
     *
     * Scoped to the seven `BASS_SPACE_FEELS`, because grounding is by design a
     * bass-space-idiom rule: the rooted feels (Rock/Metal/Country/Acoustic/…) never leave
     * the bottom of the chord to the bass in the first place, so their pad thins to the
     * guide-tone shell either way — the same as `aug`/`7b5`/`dim` already do there, with
     * the comp lane still stating the root and the alteration underneath.
     */
    describe.each([...BASS_SPACE_FEELS])(
        '%s — with the bass muted the pad states the root',
        (feel) => {
            it.each(INTENSITIES)('at intensity %s', (intensity) => {
                const rootless = [];
                for (const spelling of SWEPT) {
                    const { emitted } = sweep({
                        feel,
                        spelling,
                        bassOn: false,
                        intensity,
                        coordination: COORDINATIONS[0].base,
                    });
                    expect(emitted.length, `C${spelling} in ${feel} never sounds`).toBeGreaterThan(
                        0,
                    );
                    // Group by step: one emission is one chord voicing, and "states the
                    // root" is a claim about the voicing, not about each single voice.
                    const perStep = new Map();
                    for (const { midi, rootMidi, step } of emitted) {
                        if (!perStep.has(step)) {
                            perStep.set(step, new Set());
                        }
                        perStep.get(step).add(degree(midi, rootMidi));
                    }
                    const missing = [...perStep.values()].filter((set) => !set.has(0)).length;
                    if (missing > 0) {
                        rootless.push(
                            `C${spelling} in ${feel} @${intensity}: ${missing}/${perStep.size} voicings have no root`,
                        );
                    }
                }
                expect(rootless, 'the pad went rootless under a muted bass').toEqual([]);
            });
        },
    );

    // Runs after the describe.each blocks above (Vitest collects, then runs in order).
    it('the sweep is not vacuous — every genre x quality cell sounded at least once', () => {
        const silent = [];
        for (const { name } of GENRES) {
            for (const spelling of SWEPT) {
                const cell = `${name}|${spelling}`;
                if (!(emissionsPerCell.get(cell) > 0)) {
                    silent.push(cell);
                }
            }
        }
        const cells = GENRES.length * SWEPT.length;
        const emissions = [...emissionsPerCell.values()].reduce((sum, n) => sum + n, 0);
        console.log(
            '\n--- HARMONY WRITTEN-FIFTH SWEEP REPORT ---\n' +
                `[Genres]         ${GENRES.length}\n` +
                `[Qualities]      ${SWEPT.length} spellings (${new Set(SWEPT.map(qualityOf)).size} qualities)\n` +
                `[Cells]          ${cells} (genre x spelling)\n` +
                `[Emissions]      ${emissions} notes\n` +
                `[Silent cells]   ${silent.length} (Target: 0)\n` +
                '------------------------------------------\n',
        );
        expect(silent, 'cells that never emitted a note pass the sweep trivially').toEqual([]);
    });
});

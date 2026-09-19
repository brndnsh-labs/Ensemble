// @ts-nocheck
// cspell:ignore Cmaj Cmadd Gsus Bdim madd domsus iadd Iadd Cdom domin
/**
 * CHORD IDENTITY MATRIX (#1320–#1324)
 *
 * One row per supported chord SPELLING. A row asserts three things, because the three
 * layers can disagree and a green check on any one of them has repeatedly hidden a bug
 * in the next:
 *
 *   (a) `getChordDetails` maps the spelling to the canonical quality + `is7th`.
 *   (b) the PARSE layer (`validateProgression` -> `chord.freqs`) sounds every DEFINING
 *       degree and no MISNAMING degree, across bass-space and rooted feels, bass on and
 *       muted, at a quiet and a loud intensity (the intensity tiers add extensions, which
 *       is where a "different chord" creeps back in).
 *   (d) the functional TARGET tones (`chordTargetTones`) never include a MISNAMING degree.
 *       They are derived from the quality string, not the voicing, and feed three lanes:
 *       the soloist's strong-beat landing, the walking bass, and the comp's Q&A echo
 *       support voice (which builds a real note from them). A new quality that falls into
 *       the wrong class is the comper's bug one lane over — `madd9` shipped its first
 *       draft in the minor-7 class, b7 and all.
 *   (c) the LIVE layer (`getAccompanimentNotes`) never sounds a MISNAMING degree — the
 *       Funk clav cell rebuilds the voicing by pitch class with a synthesized fallback,
 *       so it can invent the very tone the parse layer refused to.
 *
 * The one rule behind every row: NEVER sound a tone that contradicts a written one. A
 * subset of the written chord is acceptable (a colour tone dropped by a 3-note lane);
 * a different chord is not (a b7 on a written 6th, a major 3rd on a written suspension).
 *
 * Degrees are root-relative pitch classes: 0=root 1=b9 2=9 3=b3/#9 4=3 5=4/11 6=b5/#11
 * 7=5 8=#5/b13 9=6/bb7 10=b7 11=maj7.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getChordDetails } from '../../../public/engine/chords-engine.js';
import { chordTargetTones } from '../../../public/engine/soloist-pitch-engine.js';
import { COMP_REGISTER_FLOOR } from '../../../public/engine/voicing-policy.js';
import { dispatch } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';
import { degreeOf, sound, voice } from '../../utils/voicing-probe.js';

/**
 * `spelling` is what follows the root, so 'maj7' is the chart token `Cmaj7`.
 * `defining` — degrees that must sound in EVERY tested configuration, so they exclude
 *   the root for any quality that voices rootless over a bass, and exclude colour tones
 *   a lean shell may drop.
 * `misnaming` — degrees whose presence means the listener hears a different chord.
 * `liveAllows` — misnaming degrees a genre lane legitimately (or knowingly) adds at the
 *   LIVE layer only; each entry needs a reason, and each is a candidate follow-up.
 */
const MATRIX = [
    // ---- regression pins: spellings that already parsed correctly ----
    {
        spelling: '',
        quality: 'major',
        is7th: false,
        defining: [4],
        misnaming: [3, 11],
        // why: the Funk clav cell adds a seventh over a plain triad — that is the lane's
        // idiom, not a parse defect. Since #1327 the tone is the one the chart's KEY gives
        // this root, so on the I of this C-major sweep it is the maj7 (C -> E-B-D). What
        // stops it being the out-of-key b7 again is the cross-lane test in
        // tests/standards/funk-clav-key-agreement-critique.test.ts, not this row.
        liveAllows: [11],
    },
    { spelling: 'm', quality: 'minor', is7th: false, defining: [3], misnaming: [4, 11] },
    { spelling: 'min', quality: 'minor', is7th: false, defining: [3], misnaming: [4, 11] },
    { spelling: '-', quality: 'minor', is7th: false, defining: [3], misnaming: [4, 11] },
    { spelling: 'm7', quality: 'minor', is7th: true, defining: [3, 10], misnaming: [4, 11] },
    { spelling: 'min7', quality: 'minor', is7th: true, defining: [3, 10], misnaming: [4, 11] },
    { spelling: '-7', quality: 'minor', is7th: true, defining: [3, 10], misnaming: [4, 11] },
    // `mi` is the Real Book's minor spelling; the bare `m` row used to shadow it and drop
    // the written 7th (Cmi7 -> Cm), and Cmi7b5 kept a natural 5.
    { spelling: 'mi7', quality: 'minor', is7th: true, defining: [3, 10], misnaming: [4, 11] },
    { spelling: 'Mi7', quality: 'minor', is7th: true, defining: [3, 10], misnaming: [4, 11] },
    { spelling: 'mi9', quality: 'm9', is7th: true, defining: [3, 10], misnaming: [4, 11] },
    { spelling: 'mi7b5', quality: 'halfdim', is7th: true, defining: [3, 6, 10], misnaming: [4, 7] },
    { spelling: 'miMaj7', quality: 'mMaj7', is7th: true, defining: [3, 11], misnaming: [4, 10] },
    { spelling: 'm9', quality: 'm9', is7th: true, defining: [3, 10], misnaming: [4, 11] },
    { spelling: 'm11', quality: 'm11', is7th: true, defining: [3, 10], misnaming: [4, 11] },
    { spelling: 'm13', quality: 'm13', is7th: true, defining: [3, 10], misnaming: [4, 11] },
    { spelling: 'maj7', quality: 'maj7', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: 'maj9', quality: 'maj9', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: 'maj11', quality: 'maj11', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: 'maj13', quality: 'maj13', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    {
        spelling: 'maj7#11',
        quality: 'maj7#11',
        is7th: true,
        defining: [4, 11, 6],
        misnaming: [3, 10],
    },
    { spelling: 'ma7', quality: 'maj7', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: '△7', quality: 'maj7', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: '^7', quality: 'maj7', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: '7', quality: '7', is7th: true, defining: [4, 10], misnaming: [3, 11] },
    // The Jazz block-chord shell (Red Garland, intensity > 0.7) voices a 9 as 1-5-8/3-7,
    // dropping the 9th — a subset, so only the guide tones are asserted as defining.
    { spelling: '9', quality: '9', is7th: true, defining: [4, 10], misnaming: [3, 11] },
    // #1326 — a dominant 11th features the 4th and omits the 3rd; the rooted stack
    // ([0,5,7,10,14,17]) never had one and the rootless shell no longer falls through to
    // the 13 shell that did.
    {
        spelling: '11',
        quality: '11',
        is7th: true,
        defining: [5, 10],
        misnaming: [4],
    },
    { spelling: '13', quality: '13', is7th: true, defining: [4, 10], misnaming: [3, 11] },
    { spelling: '7b9', quality: '7b9', is7th: true, defining: [4, 10, 1], misnaming: [3, 11] },
    { spelling: '7#9', quality: '7#9', is7th: true, defining: [4, 10, 3], misnaming: [11] },
    { spelling: '7#11', quality: '7#11', is7th: true, defining: [4, 10, 6], misnaming: [3, 11] },
    { spelling: '7b13', quality: '7b13', is7th: true, defining: [4, 10, 8], misnaming: [3, 11] },
    { spelling: '7alt', quality: '7alt', is7th: true, defining: [4, 10], misnaming: [7, 11] },
    { spelling: 'alt', quality: '7alt', is7th: true, defining: [4, 10], misnaming: [7, 11] },
    { spelling: '7b5', quality: '7b5', is7th: true, defining: [4, 6, 10], misnaming: [7, 11] },
    {
        spelling: 'm7b5',
        quality: 'halfdim',
        is7th: true,
        defining: [3, 6, 10],
        misnaming: [4, 7, 11],
    },
    {
        spelling: 'ø7',
        quality: 'halfdim',
        is7th: true,
        defining: [3, 6, 10],
        misnaming: [4, 7, 11],
    },
    {
        spelling: 'h7',
        quality: 'halfdim',
        is7th: true,
        defining: [3, 6, 10],
        misnaming: [4, 7, 11],
    },
    {
        spelling: 'dim',
        quality: 'dim',
        is7th: false,
        defining: [3, 6],
        misnaming: [4, 7, 11],
    },
    {
        spelling: 'dim7',
        quality: 'dim',
        is7th: true,
        defining: [3, 6, 9],
        misnaming: [4, 7, 11],
    },
    {
        spelling: 'o7',
        quality: 'dim',
        is7th: true,
        defining: [3, 6, 9],
        misnaming: [4, 7, 11],
    },
    { spelling: 'aug', quality: 'aug', is7th: false, defining: [4, 8], misnaming: [3, 7] },
    { spelling: '+', quality: 'aug', is7th: false, defining: [4, 8], misnaming: [3, 7] },
    { spelling: 'aug7', quality: 'aug', is7th: true, defining: [4, 8, 10], misnaming: [3, 7] },
    { spelling: '+9', quality: 'aug', is7th: true, defining: [4, 8, 10], misnaming: [3, 7] },
    { spelling: 'aug9', quality: 'aug', is7th: true, defining: [4, 8, 10], misnaming: [3, 7] },
    // A capitalised quality WORD starts with a root letter (A, D) — it must not be
    // stripped as one (Add9 -> "dd9", Dom7 -> "om7" -> dim).
    { spelling: 'Aug7', quality: 'aug', is7th: true, defining: [4, 8, 10], misnaming: [3, 7] },
    { spelling: 'Add9', quality: 'add9', is7th: false, defining: [4, 2], misnaming: [3, 10] },
    { spelling: 'Dim7', quality: 'dim', is7th: true, defining: [3, 6, 9], misnaming: [4, 7] },
    { spelling: 'Dom7', quality: '7', is7th: true, defining: [4, 10], misnaming: [3, 11] },
    { spelling: '7#5', quality: 'aug', is7th: true, defining: [4, 8, 10], misnaming: [3, 7] },
    {
        spelling: 'maj7#5',
        quality: 'augmaj7',
        is7th: true,
        defining: [4, 8, 11],
        misnaming: [3, 7, 10],
    },
    { spelling: '6', quality: '6', is7th: false, defining: [4, 9], misnaming: [3, 10] },
    { spelling: 'm6', quality: 'm6', is7th: false, defining: [3, 9], misnaming: [4, 10] },
    { spelling: '6/9', quality: '6/9', is7th: false, defining: [4, 9, 2], misnaming: [3, 10] },
    { spelling: 'sus2', quality: 'sus2', is7th: false, defining: [2], misnaming: [3, 4] },
    { spelling: 'sus4', quality: 'sus4', is7th: false, defining: [5], misnaming: [3, 4] },
    { spelling: '7sus4', quality: '7sus4', is7th: true, defining: [5, 10], misnaming: [3, 4] },
    { spelling: 'add9', quality: 'add9', is7th: false, defining: [4, 2], misnaming: [3, 10] },
    { spelling: 'add2', quality: 'add2', is7th: false, defining: [4, 2], misnaming: [3, 10] },
    {
        spelling: '5',
        quality: '5',
        is7th: false,
        defining: [0, 7],
        misnaming: [3, 4],
    },

    // ---- #1320 capitalised / Greek-delta major-7 spellings ----
    { spelling: 'Maj7', quality: 'maj7', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: 'MAJ7', quality: 'maj7', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: 'Maj9', quality: 'maj9', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: 'Ma7', quality: 'maj7', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: 'M7', quality: 'maj7', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: 'M9', quality: 'maj9', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: 'M11', quality: 'maj11', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: 'M13', quality: 'maj13', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: 'Δ7', quality: 'maj7', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: 'Δ', quality: 'maj7', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: '^9', quality: 'maj9', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: '^13', quality: 'maj13', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    {
        spelling: '^7#5',
        quality: 'augmaj7',
        is7th: true,
        defining: [4, 8, 11],
        misnaming: [3, 7, 10],
    },
    // A bare capital M is MAJOR; a bare lowercase m is MINOR. The only surviving
    // case-sensitive distinction in the whole matcher.
    {
        spelling: 'M',
        quality: 'major',
        is7th: false,
        defining: [4],
        misnaming: [3, 11],
        liveAllows: [11], // the clav's key-diatonic seventh (#1327) — see the '' row above
    },
    // #1329 — a bare `maj`/`ma` is the major TRIAD; `△`/`^` alone stay maj7 (iReal grammar).
    {
        spelling: 'maj',
        quality: 'major',
        is7th: false,
        defining: [4],
        misnaming: [3, 11],
        liveAllows: [11], // the clav's key-diatonic seventh (#1327) — see the '' row above
    },
    {
        spelling: 'ma',
        quality: 'major',
        is7th: false,
        defining: [4],
        misnaming: [3, 11],
        liveAllows: [11], // the clav's key-diatonic seventh (#1327) — see the '' row above
    },
    { spelling: '△', quality: 'maj7', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: '^', quality: 'maj7', is7th: true, defining: [4, 11], misnaming: [3, 10] },
    { spelling: 'maj6', quality: '6', is7th: false, defining: [4, 9], misnaming: [3, 10] },
    { spelling: 'M6', quality: '6', is7th: false, defining: [4, 9], misnaming: [3, 10] },
    { spelling: 'maj69', quality: '6/9', is7th: false, defining: [4, 9, 2], misnaming: [3, 10] },

    // ---- #1321 minor-major 7th ----
    { spelling: 'mMaj7', quality: 'mMaj7', is7th: true, defining: [3, 11], misnaming: [4, 10] },
    { spelling: 'm(maj7)', quality: 'mMaj7', is7th: true, defining: [3, 11], misnaming: [4, 10] },
    { spelling: 'mM7', quality: 'mMaj7', is7th: true, defining: [3, 11], misnaming: [4, 10] },
    { spelling: '-maj7', quality: 'mMaj7', is7th: true, defining: [3, 11], misnaming: [4, 10] },
    { spelling: 'minMaj7', quality: 'mMaj7', is7th: true, defining: [3, 11], misnaming: [4, 10] },
    { spelling: 'mMaj9', quality: 'mMaj7', is7th: true, defining: [3, 11], misnaming: [4, 10] },
    // iReal house spellings, already in the v2 score vocabulary (songbook/score-text.ts)
    { spelling: '-^7', quality: 'mMaj7', is7th: true, defining: [3, 11], misnaming: [4, 10] },
    { spelling: '-^9', quality: 'mMaj7', is7th: true, defining: [3, 11], misnaming: [4, 10] },
    { spelling: 'min^11', quality: 'mMaj7', is7th: true, defining: [3, 11], misnaming: [4, 10] },
    { spelling: 'min^13', quality: 'mMaj7', is7th: true, defining: [3, 11], misnaming: [4, 10] },

    // ---- #1322 added tones and 6/9 ----
    { spelling: 'madd9', quality: 'madd9', is7th: false, defining: [3, 2], misnaming: [4, 10, 11] },
    {
        spelling: 'm(add9)',
        quality: 'madd9',
        is7th: false,
        defining: [3, 2],
        misnaming: [4, 10, 11],
    },
    { spelling: 'madd2', quality: 'madd9', is7th: false, defining: [3, 2], misnaming: [4, 10, 11] },
    { spelling: '69', quality: '6/9', is7th: false, defining: [4, 9, 2], misnaming: [3, 10] },
    { spelling: '6(9)', quality: '6/9', is7th: false, defining: [4, 9, 2], misnaming: [3, 10] },
    { spelling: '6add9', quality: '6/9', is7th: false, defining: [4, 9, 2], misnaming: [3, 10] },
    { spelling: '-69', quality: 'm6', is7th: false, defining: [3, 9], misnaming: [4, 10] },
    {
        spelling: 'add11',
        quality: 'major',
        is7th: false,
        defining: [4],
        misnaming: [3, 11],
        liveAllows: [11], // the clav's key-diatonic seventh (#1327) — see the '' row above
    },
    {
        spelling: 'add4',
        quality: 'major',
        is7th: false,
        defining: [4],
        misnaming: [3, 11],
        liveAllows: [11], // the clav's key-diatonic seventh (#1327) — see the '' row above
    },
    { spelling: 'sus4add9', quality: 'sus4', is7th: false, defining: [5], misnaming: [3, 4] },

    // ---- #1323 sus shorthand and extended sus ----
    { spelling: 'sus', quality: 'sus4', is7th: false, defining: [5], misnaming: [3, 4] },
    { spelling: '2', quality: 'sus2', is7th: false, defining: [2], misnaming: [3, 4] },
    { spelling: '7sus', quality: '7sus4', is7th: true, defining: [5, 10], misnaming: [3, 4] },
    { spelling: '9sus4', quality: '9sus4', is7th: true, defining: [5, 10, 2], misnaming: [3, 4] },
    { spelling: '9sus', quality: '9sus4', is7th: true, defining: [5, 10, 2], misnaming: [3, 4] },
    { spelling: '13sus4', quality: '13sus4', is7th: true, defining: [5, 10], misnaming: [3, 4] },
    { spelling: '13sus', quality: '13sus4', is7th: true, defining: [5, 10], misnaming: [3, 4] },
    { spelling: '7sus2', quality: 'sus2', is7th: false, defining: [2], misnaming: [3, 4] },
    { spelling: '7b9sus', quality: '7sus4', is7th: true, defining: [5, 10], misnaming: [3, 4] },
    { spelling: '7b13sus', quality: '7sus4', is7th: true, defining: [5, 10], misnaming: [3, 4] },

    // ---- #1324 parenthesised and compound alterations ----
    {
        spelling: 'm7(b5)',
        quality: 'halfdim',
        is7th: true,
        defining: [3, 6, 10],
        misnaming: [4, 7, 11],
    },
    {
        spelling: '-7b5',
        quality: 'halfdim',
        is7th: true,
        defining: [3, 6, 10],
        misnaming: [4, 7, 11],
    },
    { spelling: 'h', quality: 'halfdim', is7th: true, defining: [3, 6, 10], misnaming: [4, 7, 11] },
    {
        spelling: 'h9',
        quality: 'halfdim',
        is7th: true,
        defining: [3, 6, 10],
        misnaming: [4, 7, 11],
    },
    {
        spelling: 'm11b5',
        quality: 'halfdim',
        is7th: true,
        defining: [3, 6, 10],
        misnaming: [4, 7, 11],
    },
    {
        spelling: 'm9b5',
        quality: 'halfdim',
        is7th: true,
        defining: [3, 6, 10],
        misnaming: [4, 7, 11],
    },
    { spelling: '7(b9)', quality: '7b9', is7th: true, defining: [4, 10, 1], misnaming: [2, 3, 11] },
    { spelling: '7(#9)', quality: '7#9', is7th: true, defining: [4, 10, 3], misnaming: [11] },
    { spelling: '7(#11)', quality: '7#11', is7th: true, defining: [4, 10, 6], misnaming: [3, 11] },
    { spelling: '7(b13)', quality: '7b13', is7th: true, defining: [4, 10, 8], misnaming: [3, 11] },
    { spelling: '13b9', quality: '7b9', is7th: true, defining: [4, 10, 1], misnaming: [2, 3, 11] },
    { spelling: '13#9', quality: '7#9', is7th: true, defining: [4, 10, 3], misnaming: [11] },
    { spelling: '9b5', quality: '7b5', is7th: true, defining: [4, 6, 10], misnaming: [7, 11] },
    { spelling: '9#5', quality: 'aug', is7th: true, defining: [4, 8, 10], misnaming: [3, 7] },
    // #1329 — a real `maj7b5` quality, so the written b5 sounds and the 5th it flattens
    // does not. Every other quality in the table voices a natural 5 with its b5, which is
    // why this spelling used to approximate to maj7#11.
    {
        spelling: 'maj7b5',
        quality: 'maj7b5',
        is7th: true,
        defining: [4, 11, 6],
        misnaming: [3, 10, 7],
    },
    {
        spelling: 'M7b5',
        quality: 'maj7b5',
        is7th: true,
        defining: [4, 11, 6],
        misnaming: [3, 10, 7],
    },
    { spelling: '7#5#9', quality: '7alt', is7th: true, defining: [4, 10], misnaming: [7, 11] },
    { spelling: '7b5b9', quality: '7alt', is7th: true, defining: [4, 10], misnaming: [7, 11] },
    { spelling: '7b9#5', quality: '7alt', is7th: true, defining: [4, 10], misnaming: [7, 11] },
    { spelling: '7#9b5', quality: '7alt', is7th: true, defining: [4, 10], misnaming: [7, 11] },
    // A second alteration the engine cannot represent is DROPPED (a subset), never swapped.
    { spelling: '7#9b13', quality: '7#9', is7th: true, defining: [4, 10, 3], misnaming: [11] },
    { spelling: '7b9#9', quality: '7b9', is7th: true, defining: [4, 10, 1], misnaming: [2, 3, 11] },
    { spelling: 'dom7', quality: '7', is7th: true, defining: [4, 10], misnaming: [3, 11] },
    // #1329 — the last spelling that still sounded a natural 9 against a written b9. It kept
    // '13' through #1324 only because chords-logic.test.ts pinned it, and that pin asserted
    // the bug; both now expect the altered dominant that states the alteration.
    {
        spelling: '13(#11b9)',
        quality: '7b9',
        is7th: true,
        defining: [4, 10, 1],
        misnaming: [2, 3, 11],
    },
    {
        spelling: '13#11b9',
        quality: '7b9',
        is7th: true,
        defining: [4, 10, 1],
        misnaming: [2, 3, 11],
    },
];

const PARSE_FEELS = ['Jazz', 'Funk', 'Neo-Soul', 'Acoustic'];
const LIVE_FEELS = ['Jazz', 'Funk', 'Neo-Soul'];
// One bar per chord so every chord owns a full 16-step bar in the live probe.
const CHART = MATRIX.map((row) => `C${row.spelling}`).join(' | ');

describe('Chord identity matrix (#1320-#1324)', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
    });

    describe('(a) getChordDetails', () => {
        it.each(MATRIX)('C$spelling -> $quality', ({ spelling, quality, is7th }) => {
            expect(getChordDetails(spelling)).toMatchObject({ quality, is7th });
        });

        it('reads the same whether or not the root letter is included', () => {
            for (const { spelling, quality, is7th } of MATRIX) {
                expect(getChordDetails(`C${spelling}`), `C${spelling}`).toMatchObject({
                    quality,
                    is7th,
                });
            }
        });
    });

    describe('(d) functional target tones', () => {
        it.each(MATRIX)('C$spelling targets none of its misnaming degrees', (row) => {
            const { guides, pillars } = chordTargetTones(0, row.quality);
            for (const pc of [...guides, ...pillars]) {
                expect(row.misnaming, `C${row.spelling} targets degree ${pc}`).not.toContain(pc);
            }
        });

        it('a suspended dominant targets its 4th and b7, never the major 3rd (#1328)', () => {
            for (const quality of ['7sus4', '9sus4', '13sus4']) {
                const { guides, pillars } = chordTargetTones(0, quality);
                expect(guides, quality).toEqual([5, 10]);
                expect([...guides, ...pillars], quality).not.toContain(4);
            }
            expect(chordTargetTones(0, 'sus2').guides).toEqual([2]);
        });

        it('a minor-major 7th targets its major 7th, never the b7', () => {
            const { guides, pillars } = chordTargetTones(0, 'mMaj7');
            expect(guides).toContain(11);
            expect([...guides, ...pillars]).not.toContain(10);
        });
    });

    describe.each(PARSE_FEELS)('(b) parse layer — %s', (feel) => {
        it.each([0.35, 0.9])('states every written chord at intensity %s', (intensity) => {
            for (const bassOn of [true, false]) {
                const parsed = voice(feel, bassOn, CHART, 'C', true, intensity);
                expect(parsed).toHaveLength(MATRIX.length);
                MATRIX.forEach((row, index) => {
                    const chord = parsed[index];
                    const where = `C${row.spelling} (${row.quality}) in ${feel}, bass on: ${bassOn} @${intensity}`;
                    expect(chord.quality, where).toBe(row.quality);
                    for (const degree of row.defining) {
                        expect(chord.degrees.has(degree), `${where} lost degree ${degree}`).toBe(
                            true,
                        );
                    }
                    for (const degree of row.misnaming) {
                        expect(chord.degrees.has(degree), `${where} sounds degree ${degree}`).toBe(
                            false,
                        );
                    }
                    expect(
                        Math.min(...chord.midis),
                        `${where} below the comp register`,
                    ).toBeGreaterThanOrEqual(COMP_REGISTER_FLOOR);
                });
            }
        });
    });

    describe.each(LIVE_FEELS)('(c) live layer — %s', (feel) => {
        it.each([0.35, 0.65])('never sounds a misnaming tone at intensity %s', (intensity) => {
            for (const bassOn of [true, false]) {
                // 4 laps: enough for the ghost/answer/economy branches that only fire on
                // some steps, without a 100-bar chart costing seconds per feel.
                const heard = sound(feel, bassOn, CHART, intensity, 4);
                expect(heard).toHaveLength(MATRIX.length);
                MATRIX.forEach((row, index) => {
                    const { sets } = heard[index];
                    const allowed = new Set(row.liveAllows || []);
                    const forbidden = row.misnaming.filter((degree) => !allowed.has(degree));
                    for (const degrees of sets) {
                        for (const degree of forbidden) {
                            expect(
                                degrees,
                                `C${row.spelling} (${row.quality}) in ${feel}, bass on: ${bassOn} @${intensity} sounds degree ${degree}`,
                            ).not.toContain(degree);
                        }
                    }
                });
            }
        });
    });

    // The lowercase numeral is the OTHER way a chord's quality is written, and its remap
    // is a separate site from the suffix matcher (#1317 fixed `iv6` there; these are the
    // same class).
    describe('lowercase roman numerals are minor', () => {
        it.each([
            ['imaj7', 'mMaj7', [3, 11], [4, 10]],
            ['iM7', 'mMaj7', [3, 11], [4, 10]],
            ['im(maj7)', 'mMaj7', [3, 11], [4, 10]],
            ['iv6/9', 'm6', [3, 9], [4, 10]],
            ['iadd9', 'madd9', [3, 2], [4, 10, 11]],
            // pins: the remap entries that already existed
            ['i6', 'm6', [3, 9], [4, 10]],
            ['i7', 'minor', [3, 10], [4, 11]],
            ['ii9', 'm9', [3, 10], [4, 11]],
        ])('%s parses as %s', (token, quality, defining, misnaming) => {
            for (const feel of ['Jazz', 'Acoustic']) {
                const [chord] = voice(feel, true, token, 'C', true, 0.35, { isMinor: true });
                expect(chord.quality, `${token} in ${feel}`).toBe(quality);
                for (const degree of defining) {
                    expect(chord.degrees.has(degree), `${token} lost ${degree}`).toBe(true);
                }
                for (const degree of misnaming) {
                    expect(chord.degrees.has(degree), `${token} sounds ${degree}`).toBe(false);
                }
            }
        });

        it('keeps the UPPERCASE numeral major', () => {
            const [imaj7, iv69, iadd9] = voice('Acoustic', true, 'Imaj7 | IV6/9 | Iadd9');
            expect(imaj7.quality).toBe('maj7');
            expect(imaj7.degrees.has(4)).toBe(true);
            expect(iv69.quality).toBe('6/9');
            expect(iv69.degrees.has(4)).toBe(true);
            expect(iadd9.quality).toBe('add9');
            expect(iadd9.degrees.has(4)).toBe(true);
        });
    });

    // #1321's line cliché: the whole point of the chord is the chromatic descent from the
    // root through the maj7 and b7 to the 6th.
    it('voices the Am | AmMaj7 | Am7 | Am6 descent as G# G F#', () => {
        const parsed = voice('Acoustic', false, 'Am | AmMaj7 | Am7 | Am6', 'A', true, 0.35);
        const [am, amMaj7, am7, am6] = parsed;
        expect(am.quality).toBe('minor');
        expect(amMaj7.quality).toBe('mMaj7');
        expect(am7.quality).toBe('minor');
        expect(am6.quality).toBe('m6');
        // G# (degree 11), G (10), F# (9) in turn — and never the wrong one of the three.
        expect(amMaj7.degrees.has(11)).toBe(true);
        expect(amMaj7.degrees.has(10)).toBe(false);
        expect(am7.degrees.has(10)).toBe(true);
        expect(am7.degrees.has(11)).toBe(false);
        expect(am6.degrees.has(9)).toBe(true);
        expect(am6.degrees.has(10)).toBe(false);
        expect(am6.degrees.has(11)).toBe(false);
    });

    it('sounds the shipped Neo-Soul preset V9sus4 as a suspension, not a dominant 9', () => {
        // public/data/chord-presets.ts / song-templates.ts: 'IVmaj9 | III7#9 | vi11 | V9sus4'
        const chart = 'IVmaj9 | III7#9 | vi11 | V9sus4';
        for (const bassOn of [true, false]) {
            const [, , , v9sus4] = voice('Neo-Soul', bassOn, chart, 'C', true, 0.35);
            expect(v9sus4.quality).toBe('9sus4');
            expect(v9sus4.name).toBe('G9sus4');
            expect(v9sus4.degrees.has(5), 'the 4th IS the chord').toBe(true);
            expect(v9sus4.degrees.has(4), 'a major 3rd cancels the suspension').toBe(false);
            for (const { sets } of sound('Neo-Soul', bassOn, chart, 0.35, 4).slice(3)) {
                for (const degrees of sets) {
                    expect(degrees, `V9sus4 live, bass on: ${bassOn}`).not.toContain(4);
                }
            }
        }
    });

    // What the CHART shows has to match what the band plays: the display suffix comes from
    // `getFormattedChordNames`, a separate enumeration from the voicing tables, and its
    // `is7th` "+7" append is what rendered a written G7sus4 as "G7sus47" (#1323).
    it.each([
        ['G7sus4', 'G7sus4'],
        ['G9sus4', 'G9sus4'],
        ['G13sus4', 'G13sus4'],
        ['Gsus', 'Gsus4'],
        ['G7sus', 'G7sus4'],
        ['CMaj7', 'Cmaj7'],
        ['CM9', 'Cmaj9'],
        ['CΔ7', 'Cmaj7'],
        ['Cmaj6', 'C6'],
        ['CmMaj7', 'CmMaj7'],
        ['Cm(maj7)', 'CmMaj7'],
        ['C-^7', 'CmMaj7'],
        ['Cmadd9', 'Cmadd9'],
        ['C69', 'C6/9'],
        ['Bm7(b5)', 'Bm7b5'],
        ['G7(b9)', 'G7b9'],
        ['Cdom7', 'C7'],
    ])('%s displays as %s', (token, expected) => {
        const [chord] = voice('Acoustic', true, token);
        expect(chord.name).toBe(expected);
        // A stray digit from the is7th append is the specific failure mode here.
        expect(chord.name).not.toMatch(/\d7$|77$/);
    });

    // A slash inside a chord symbol is only a bass note when what follows it is a ROOT.
    // `Cm/maj7` used to split there, leaving a plain Cm whose "bass" was the unparseable
    // text `maj7` — which `resolveChordRoot` silently resolves to the KEY root (#1329).
    it.each([
        ['Cm/maj7', 'mMaj7', 'CmMaj7'],
        ['Cm/M7', 'mMaj7', 'CmMaj7'],
        ['C-/maj7', 'mMaj7', 'CmMaj7'],
        ['C6/9', '6/9', 'C6/9'],
        ['Cm6/9', 'm6', 'Cm6'],
    ])('%s is one chord, not a slash bass', (token, quality, absName) => {
        const [chord] = voice('Acoustic', true, token);
        expect(chord.quality).toBe(quality);
        expect(chord.name).toBe(absName);
        // A real slash bass still splits: the bass note lands below the comp voicing.
        const [slash] = voice('Acoustic', true, 'Cmaj7/G');
        expect(slash.name).toBe('Cmaj7/G');
    });

    // #1329 — `Cmaj`/`Cma` are major TRIADS. The bare triangle/caret keep their iReal
    // meaning (maj7), which is the distinction that makes this worth pinning.
    it('bare maj/ma is a triad while bare △/^ is a maj7', () => {
        const [cmaj, cma, triangle, caret] = voice('Acoustic', true, 'Cmaj | Cma | C△ | C^');
        for (const chord of [cmaj, cma]) {
            expect(chord.quality).toBe('major');
            expect(chord.is7th).toBe(false);
            expect(chord.name).toBe('C');
            expect(chord.degrees.has(11), 'no unwritten major 7th').toBe(false);
        }
        for (const chord of [triangle, caret]) {
            expect(chord.quality).toBe('maj7');
            expect(chord.degrees.has(11)).toBe(true);
        }
    });

    // The matcher is anchored at the start of the suffix, so an alternative can no longer
    // match mid-word — the mechanism behind Cmadd9 -> maj7 and Cdom7 -> dim7.
    it('never matches a quality alternative inside a longer word', () => {
        expect(getChordDetails('madd9').quality).not.toBe('maj7');
        // #1329 — every `madd…` spelling, including the ones with no row of their own, is a
        // MINOR chord. `ma` (maj7) is a prefix of all of them, so it lives in the normaliser
        // behind a not-followed-by-a-letter guard rather than in the table.
        for (const spelling of ['madd9', 'madd2', 'madd11', 'madd4', 'madd13', 'madd']) {
            const { quality } = getChordDetails(spelling);
            expect(['madd9', 'minor'], `${spelling} -> ${quality}`).toContain(quality);
        }
        expect(getChordDetails('dom7').quality).not.toBe('dim');
        expect(getChordDetails('domin7').quality).not.toBe('dim');
    });

    it('survives junk suffixes without throwing', () => {
        for (const junk of ['', '!!!', '---------', 'øøø', 'sus2sus4', 'maj7maj7', 'm7m7', 'zz']) {
            expect(() => getChordDetails(junk)).not.toThrow();
            expect(getChordDetails(junk)).toHaveProperty('quality');
        }
    });

    it('degreeOf measures from the chord root', () => {
        expect(degreeOf(64, { rootMidi: 60 })).toBe(4);
        expect(degreeOf(58, { rootMidi: 60 })).toBe(10);
    });
});

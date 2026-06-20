// @ts-nocheck
// tests/standards/jazz-soloist-authenticity.test.js

import { getSoloistNote } from '../../public/engine/soloist.js';
import { STYLE_CONFIG } from '../../public/engine/soloist-config.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

describe('Jazz Soloist Authenticity Benchmark', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
        dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Jazz', enabled: true });
        // why: defensively clear pinnedProfile alongside RESET_STATE so a
        // future test file that runs UPDATE_SB { pinnedProfile: 'evans' } and
        // skips RESET_STATE can't sticky-retain into this file's profile-
        // rotation expectations. FOLLOWUPS §F (Epic 12 S3 review).
        dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'jazz', pinnedProfile: null });
        dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'debugSoloist', value: true });
    });

    it('should alternate between Call and Response roles in Jazz', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 64 };
        const { soloist } = getState();

        let callCount = 0;
        let responseCount = 0;

        for (let i = 0; i < 500; i += 16) {
            if (soloist.session.phrasing.isResting) {
                soloist.session.phrasing.restSteps = 0;
            }
            getSoloistNote(
                getState(),
                chord,
                null,
                i,
                440,
                0,
                'jazz',
                0,
                { sectionStart: 0, sectionEnd: 128, bypassRhythm: true },
                { mStep: 0 },
            );

            if (soloist.session.currentPhrase.context.role === 'call') {
                callCount++;
            } else {
                responseCount++;
            }

            soloist.session.phrasing.activeSteps = 0;
            soloist.session.phrasing.isResting = true;
        }

        console.log(`[Jazz Audit] Calls: ${callCount}, Responses: ${responseCount}`);
        expect(callCount).toBeGreaterThan(0);
        expect(responseCount).toBeGreaterThan(0);
    });

    it('should pick characteristic Jazz profiles (Bird, Evans, Coltrane, Miles)', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10] };
        const { soloist } = getState();

        const profilesSeen = new Set();

        // Simulate 100 section boundaries to ensure we see the whole pool
        for (let section = 0; section < 100; section++) {
            const sectionStart = section * 64;
            const sectionEnd = (section + 1) * 64;

            getSoloistNote(
                getState(),
                chord,
                null,
                sectionStart,
                440,
                0,
                'jazz',
                0,
                { sectionStart, sectionEnd, bypassRhythm: true },
                { mStep: 0, isMeasureStart: true, isBeatStart: true },
            );

            if (soloist.session.currentPhrase.context.profile) {
                profilesSeen.add(soloist.session.currentPhrase.context.profile);
            }
        }

        console.log(`[Jazz Audit] Profiles detected: ${Array.from(profilesSeen).join(', ')}`);
        expect(profilesSeen.has('bird')).toBe(true);
        expect(profilesSeen.has('evans')).toBe(true);
        expect(profilesSeen.has('coltrane')).toBe(true);
        expect(profilesSeen.has('miles')).toBe(true);
    });

    // #573 — the Jazz GENRE runs the `bird` STYLE (SMART_GENRES.Jazz.soloist), so
    // the line-323 `activeStyle === 'jazz'` bebopScale gate (the user-selectable
    // "Jazz Comp" path) never fired for it. The built-and-wanted bebopScale device
    // was unreachable from the genre. Fix: bebopScale added to bird.allowedDevices
    // at the lowest pickByRank weight. These two tests guard that it's reachable
    // AND stays subordinate to Parker's enclosure/approach-tone lean.
    it('exposes bebopScale in the bird palette at the lowest device weight', () => {
        const devices = STYLE_CONFIG.bird.allowedDevices;
        expect(devices).toContain('bebopScale'); // was absent pre-#573
        // pickByRank weights by position (first = heaviest). Lowest weight = last.
        expect(devices[devices.length - 1]).toBe('bebopScale');
    });

    it('lets the Jazz-genre (bird) soloist actually play bebopScale, but rarely', () => {
        // Drive the genre path: style 'bird' resolves activeStyle to 'bird'
        // (SMART_GENRES.Jazz.soloist), NOT the literal 'jazz' style that trips the
        // line-323 gate — so this exercises the genuine genre route the fix targets.
        const Dm7 = { rootMidi: 62, quality: 'm7', intervals: [0, 3, 7, 10], beats: 4 };
        const G7 = { rootMidi: 67, quality: '7', intervals: [0, 4, 7, 10], beats: 4 };
        const Cmaj7 = { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], beats: 4 };
        const prog = [Dm7, G7, Cmaj7, Cmaj7];

        const counts = {};
        const numBars = 2000;
        for (let bar = 0; bar < numBars; bar++) {
            const chord = prog[bar % 4];
            for (let step = 0; step < 16; step++) {
                const note = getSoloistNote(
                    getState(),
                    chord,
                    chord,
                    bar * 16 + step,
                    0,
                    64,
                    'bird',
                    step,
                );
                if (note) {
                    const primary = Array.isArray(note) ? note[0] : note;
                    const device = primary?.device || 'none';
                    counts[device] = (counts[device] || 0) + 1;
                }
            }
        }

        const bebop = counts.bebopScale || 0;
        const lead = (counts.enclosure || 0) + (counts.run || 0);
        console.log(`[Jazz genre/bird devices] ${JSON.stringify(counts)}`);
        // Reachable now (structurally 0 before the fix). Deterministic ~20 firings
        // over 2000 bars; assert a floor with headroom against run-to-run drift.
        expect(bebop).toBeGreaterThan(4);
        // Stays subordinate: the bird idiom leads on enclosures/approach tones, so
        // bebopScale must not dominate them (low-weight intent). Guards a future
        // re-ordering that would over-promote it.
        expect(bebop).toBeLessThan(lead);
    });

    it('Bill Evans profile should target upper extensions', () => {
        // why: large loop + per-iteration profile/role pin keeps the engine
        // measurably "in Evans" for the whole sample. Pre-S2 the test ran
        // 200 steps with profile pinned once at setup; soloist.ts's section-
        // boundary profile re-roll (Math.random() < 0.8) overwrote Evans at
        // step 128 in ~80% of runs, halving effective Evans coverage and
        // driving small-sample noise. Now we re-pin every iteration so the
        // measurement reflects the engine's actual Evans behavior, not the
        // rotation-churn artifact. Also extended to 800 steps for sample
        // stability (typical capture is ~120-180 notes, vs ~25-50 pre-fix).
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 64 };
        const { soloist } = getState();

        let extensionCount = 0;
        let totalNotes = 0;

        for (let i = 1; i < 801; i++) {
            soloist.session.currentPhrase.context.profile = 'evans';
            soloist.session.currentPhrase.context.role = 'call';

            const note = getSoloistNote(
                getState(),
                chord,
                null,
                i,
                440,
                0,
                'jazz',
                i % 16,
                { sectionStart: 0, sectionEnd: 512 },
                { mStep: i % 16 },
            );
            if (note) {
                const results = Array.isArray(note) ? note : [note];
                const lastNote = results[results.length - 1];
                const rel = ((lastNote.midi % 12) - (chord.rootMidi % 12) + 12) % 12;
                if ([2, 5, 6, 9].includes(rel)) {
                    extensionCount++;
                }
                totalNotes++;
            }
        }

        const extensionRate = extensionCount / totalNotes;
        console.log(
            `[Jazz Audit] Evans Extension Rate: ${(extensionRate * 100).toFixed(1)}% (Notes: ${totalNotes})`,
        );
        // Bill Evans should target extensions significantly more than roots,
        // but NOT blanket the line with them. Transcribed Evans sits in the
        // 25-35% band; >55% is stacked-fourths / late-modal caricature.
        // Floor was 0.3 pre-S2 but that was calibrated for the additive
        // `+500` anti-pattern that produced ~80% extensions; a musically
        // defensible hybrid lands at ~30% mean with a ~15-50% distribution
        // because the engine's RNG (picker scoring, profile re-rolls,
        // rhythm seed) is not test-seeded. Wide bounds reflect the engine's
        // real variance band; the upper bound at 0.55 still trips if a
        // future change pushes back into caricature (×80 era was ~55%
        // mean, not just tail). 30-run loop passes 28-30/30 in practice.
        // See Evans multiplier comment in soloist-pitch-engine.ts for the
        // tuning rationale and the deferred follow-up on RNG seeding.
        expect(extensionRate).toBeGreaterThan(0.15);
        expect(extensionRate).toBeLessThan(0.55);
    });

    it('Bill Evans response cadences should resolve home (root/5th present)', () => {
        // why: pre-S2 the Evans extension boost (`weight += 500; weight *= 10`)
        // ran on EVERY attack, including phrase-end response beats. Combined
        // with `if (interval === 0) weight *= 0.01`, the root was effectively
        // unreachable — ~0% of attacks landed on the root regardless of
        // phrase position or role. The V→I cadence couldn't happen.
        //
        // S2 fix: at `isPhraseEnd && role === 'response'`, the Evans extension
        // multiplier is bypassed so the existing phrase-end ×4.0 root/5th pull
        // can win. Across a long Evans-response loop, the root should appear
        // as a meaningful fraction of landings (was ~0% pre-fix). Floor is
        // intentionally modest: only phrase-end attacks get the cadence
        // bypass, and phrase-end attacks are a small subset of total notes,
        // so root rate across all attacks lands in the single-digit-percent
        // band post-fix. The guard catches regression to ~0%.
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 64 };
        const { soloist } = getState();

        soloist.session.currentPhrase.context.profile = 'evans';
        soloist.session.currentPhrase.context.role = 'response';

        let rootCount = 0;
        let fifthCount = 0;
        let totalNotes = 0;

        for (let i = 1; i < 801; i++) {
            // Re-pin profile + role each iteration so the engine's natural
            // call/response rotation and profile re-roll don't drift us out.
            soloist.session.currentPhrase.context.profile = 'evans';
            soloist.session.currentPhrase.context.role = 'response';

            const note = getSoloistNote(
                getState(),
                chord,
                null,
                i,
                440,
                0,
                'jazz',
                i % 16,
                { sectionStart: 0, sectionEnd: 512 },
                { mStep: i % 16 },
            );
            if (note) {
                const results = Array.isArray(note) ? note : [note];
                const lastNote = results[results.length - 1];
                const rel = ((lastNote.midi % 12) - (chord.rootMidi % 12) + 12) % 12;
                if (rel === 0) {
                    rootCount++;
                }
                if (rel === 7) {
                    fifthCount++;
                }
                totalNotes++;
            }
        }

        const rootRate = rootCount / totalNotes;
        const fifthRate = fifthCount / totalNotes;
        const homeRate = (rootCount + fifthCount) / totalNotes;
        console.log(
            `[Jazz Audit] Evans Response Cadence: root ${(rootRate * 100).toFixed(1)}%, 5th ${(fifthRate * 100).toFixed(1)}%, home ${(homeRate * 100).toFixed(1)}% (Notes: ${totalNotes})`,
        );
        // Pre-S2 baseline: ~0% root, ~0% 5th, all extensions. Post-fix: at
        // phrase-end the extension boost is bypassed and the existing
        // phrase-end ×4.0 root/5th cadence pull wins. Root and 5th are both
        // legitimate V→I cadence targets; the 5th often wins because of
        // stepwise-motion bias from the prior attack. The combined home
        // (root+5th) rate is the primary musical signal — Evans response
        // cadences should land on a tonic-anchor tone, regardless of which
        // one. Floor at 0.10 is conservative against ~20-50% observed.
        //
        // Root-alone floor at 0.01 is a belt-and-suspenders regression guard
        // against the specific `×0.01 → ×0.1` root-suppression loosening:
        // if a future change reverts it (e.g. "tighten Evans roots back
        // up"), root alone would re-collapse toward 0% even with the home
        // rate carried by the 5th. Observed root-alone range across 30 runs
        // is ~1.5-13%, so the 1% floor has headroom (~0.5pt over worst-case
        // tail) while still tripping on the pre-fix ~0% baseline. The
        // root-alone metric is noisy because phrase-end attacks are sparse;
        // FOLLOWUPS.md tracks isolating to phrase-end specifically.
        expect(homeRate).toBeGreaterThan(0.1);
        expect(rootRate).toBeGreaterThan(0.01);
    });

    // why: Epic 12 S2 — `evansIntervals = {2, 5, 6, 9}` was chord-quality blind.
    // Interval 6 is a valid Evans color on maj7 (lydian #11) and dom7 (#11/13),
    // but lands as the b5 *avoid note* on m7 (Db over Dm7 — the "sour b5" the
    // audit report flagged in Evans-style minor passages).
    //
    // The fix splits the flat set into per-quality legal-extension tables
    // (EVANS_INTERVALS_BY_QUALITY in soloist-pitch-engine.ts). This test asserts
    // the per-quality split actually changes the picker's distribution:
    //   - On m7 (Dm7), interval-6 (b5) landings collapse vs other-extensions.
    //   - On maj7 (Cmaj7), interval-6 (#11) remains a legitimate Evans color.
    //
    // We measure pitch-class 6-semitones-above-root rate against the
    // remainder of the Evans extension set (intervals 2, 5, 9 — 9th, 11th,
    // 13th). On m7, interval-6 should be a small minority of extension
    // landings (post-fix observed ~0-1% of m7 attacks; pre-fix was ~3-6% on
    // m7 of all attacks, but among extension landings it was a meaningful
    // chunk). On maj7, interval-6 should remain present as a legitimate
    // lydian #11 color.
    //
    // FRAGILE: the picker is unseeded here; threshold is set conservatively
    // against 30-run drift. If a future change tightens or loosens the Evans
    // extension multiplier (currently +60 then ×3.5, see soloist-pitch-engine.ts),
    // re-baseline both rates — the pre-fix vs post-fix delta on m7 interval-6
    // is the load-bearing assertion.
    it('Evans on m7 chord avoids the b5 (interval 6) — per-quality extension fix', () => {
        // Dm7 — interval 6 above D is G#/Ab, which is the b5/#11 *avoid note*
        // on a minor 7th chord. Evans's transcribed playing on m7 lines
        // (modal-ii passages) does not feature the b5.
        const m7Chord = {
            rootMidi: 62,
            quality: 'm7',
            intervals: [0, 3, 7, 10],
            sectionStart: 0,
            sectionEnd: 64,
        };
        // Cmaj7 — interval 6 above C is F#, the lydian #11. This IS an Evans
        // color (the "So What" voicing's cousin) and should remain present.
        const maj7Chord = {
            rootMidi: 60,
            quality: 'maj7',
            intervals: [0, 4, 7, 11],
            sectionStart: 0,
            sectionEnd: 64,
        };
        const { soloist } = getState();

        const tally = (chord: { rootMidi: number; quality: string; intervals: number[] }) => {
            let interval6Count = 0;
            let extensionCount = 0; // intervals 2/5/6/9 — the "extension class"
            let totalNotes = 0;
            for (let i = 1; i < 801; i++) {
                soloist.session.currentPhrase.context.profile = 'evans';
                // 'call' role so the phrase-end Evans cadence skip doesn't
                // suppress the extension boost (the b5 avoid lurks in non-
                // cadence attacks, not the cadence ones).
                soloist.session.currentPhrase.context.role = 'call';
                const note = getSoloistNote(
                    getState(),
                    chord,
                    null,
                    i,
                    440,
                    0,
                    'jazz',
                    i % 16,
                    { sectionStart: 0, sectionEnd: 512 },
                    { mStep: i % 16 },
                );
                if (!note) {
                    continue;
                }
                const results = Array.isArray(note) ? note : [note];
                const last = results[results.length - 1];
                const rel = (((last.midi % 12) - (chord.rootMidi % 12) + 12) % 12) % 12;
                totalNotes++;
                if (rel === 6) {
                    interval6Count++;
                }
                if (rel === 2 || rel === 5 || rel === 6 || rel === 9) {
                    extensionCount++;
                }
            }
            return { interval6Count, extensionCount, totalNotes };
        };

        const m7 = tally(m7Chord);
        const maj7 = tally(maj7Chord);

        const m7Interval6Rate = m7.interval6Count / Math.max(m7.totalNotes, 1);
        const maj7Interval6Rate = maj7.interval6Count / Math.max(maj7.totalNotes, 1);
        const m7ExtensionRate = m7.extensionCount / Math.max(m7.totalNotes, 1);
        const maj7ExtensionRate = maj7.extensionCount / Math.max(maj7.totalNotes, 1);

        console.log(
            '\n[Jazz Audit] Evans per-quality extension split\n' +
                `  Dm7  : interval-6 ${(m7Interval6Rate * 100).toFixed(1)}% | ` +
                `all-extensions ${(m7ExtensionRate * 100).toFixed(1)}% (n=${m7.totalNotes})\n` +
                `  Cmaj7: interval-6 ${(maj7Interval6Rate * 100).toFixed(1)}% | ` +
                `all-extensions ${(maj7ExtensionRate * 100).toFixed(1)}% (n=${maj7.totalNotes})\n`,
        );

        // Sample sanity.
        expect(m7.totalNotes).toBeGreaterThan(100);
        expect(maj7.totalNotes).toBeGreaterThan(100);

        // m7 b5-avoid-note rate must be small. Measured baselines (this
        // fixture is deterministic — see note below; identical numbers across
        // 10 runs):
        //   - pre-fix  (`evansIntervals = {2,5,6,9}` boost fires on interval 6
        //               over m7): Dm7 interval-6 = 6.5%
        //   - post-fix (per-quality table drops interval 6 from m7): Dm7
        //               interval-6 = 2.2%
        // 4.3pt delta. Threshold 3.5% sits 1.3pt above the post-fix rate and
        // 3.0pt below the pre-fix rate. Cmaj7 is the control — interval 6
        // (lydian #11) stays at 6.5% on maj7 in both versions because the
        // 'maj' bucket still includes interval 6.
        //
        // why determinism note: the fixture uses no `Math.random` stub but
        // every observed run produced identical counts (10/10 runs identical).
        // The picker reads `Math.random` but the rhythm-plan / phrase-role
        // state is reset identically each run via `RESET_STATE` and the
        // re-pin loop, so the engine's call order into Math.random is
        // consistent and the un-stubbed PRNG advances in lockstep. If a future
        // engine change introduces a new Math.random call inside the per-
        // quality picker path, this fixture will drift — retune via a 10-
        // run sample if the absolute numbers shift, but the post-fix vs
        // pre-fix delta (the b5-on-m7 suppression) should hold.
        expect(m7Interval6Rate).toBeLessThan(0.035);

        // maj7 interval-6 (lydian #11) is a legitimate Evans color and should
        // remain present at a non-trivial rate — the per-quality fix only
        // changes m7, not maj7. Floor at 0.5% guards against an accidental
        // over-fix that removes interval 6 from maj7 too.
        expect(maj7Interval6Rate).toBeGreaterThan(0.005);

        // Cross-check: maj7 total extension rate stays in the Evans band, so
        // the per-quality split didn't accidentally suppress all extensions
        // on maj7. The existing "Bill Evans profile should target upper
        // extensions" test guards the all-chords mean; this guards maj7
        // specifically.
        expect(maj7ExtensionRate).toBeGreaterThan(0.15);
    });

    // why: Epic 12 S2 controls — the m7/maj7 split test above guards the two
    // load-bearing buckets, but EVANS_INTERVALS_BY_QUALITY has three more shapes
    // that deserve explicit regression guards:
    //   - min6 = {2, 5}: drops both interval 6 (b5 avoid) AND interval 9 (which
    //     is M6 = chord tone on m6, so the chord-tone bonus already fires and
    //     an extension reward would double-count).
    //   - dom  = {2, 5, 6, 9}: interval 6 (#11/13) is a legitimate Evans color
    //     on dom7 (positive control — the per-quality split must not have
    //     accidentally suppressed it).
    //   - alt  = empty: altered dominants route through alteredHookIntervals
    //     elsewhere; the Evans diatonic set must not pull toward unaltered
    //     9/13 against the chord's b9/#9/b13/#11.
    // FOLLOWUPS §F (Epic 12 S2 review P2).
    it('Evans per-quality buckets: min6 drops 9, dom retains 6, alt is empty (Epic 12 S2 controls)', () => {
        // Cm6 — min6 bucket: Set([2, 5]). The 9 (M6 above C = A) is the
        // chord's defining sixth; chord-tone bonus already handles it. Drop
        // 9 from extensions to avoid double-counting and (more importantly)
        // to keep the engine from over-emphasizing the 6 voicing relative
        // to genuine extensions like 9 (D) and 11 (F).
        const m6Chord = {
            rootMidi: 60,
            quality: 'm6',
            intervals: [0, 3, 7, 9],
            sectionStart: 0,
            sectionEnd: 64,
        };
        // C7 — dom bucket: Set([2, 5, 6, 9]). Interval 6 (F# = #11/b5 of C7
        // — the "lydian dominant" color) is a legitimate Evans color on
        // dom7 (think the dominant-resolution voicings on a ii-V).
        const dom7Chord = {
            rootMidi: 60,
            quality: '7',
            intervals: [0, 4, 7, 10],
            sectionStart: 0,
            sectionEnd: 64,
        };
        // G7alt — alt bucket: empty. Picker delegates to alteredHookIntervals;
        // the Evans diatonic boost must not fire. Compared against the C7
        // baseline above, G7alt's extension landings (intervals 2/5/6/9 above
        // G) should sit notably lower because no Evans set pull is active.
        const altChord = {
            rootMidi: 67,
            quality: '7alt',
            intervals: [0, 4, 7, 10],
            sectionStart: 0,
            sectionEnd: 64,
        };
        const { soloist } = getState();

        const tally = (chord: { rootMidi: number; quality: string; intervals: number[] }) => {
            let interval6Count = 0;
            let interval9Count = 0;
            let extensionCount = 0; // intervals 2/5/6/9 — the "extension class"
            let totalNotes = 0;
            for (let i = 1; i < 801; i++) {
                soloist.session.currentPhrase.context.profile = 'evans';
                soloist.session.currentPhrase.context.role = 'call';
                const note = getSoloistNote(
                    getState(),
                    chord,
                    null,
                    i,
                    440,
                    0,
                    'jazz',
                    i % 16,
                    { sectionStart: 0, sectionEnd: 512 },
                    { mStep: i % 16 },
                );
                if (!note) {
                    continue;
                }
                const results = Array.isArray(note) ? note : [note];
                const last = results[results.length - 1];
                const rel = ((last.midi % 12) - (chord.rootMidi % 12) + 12) % 12;
                totalNotes++;
                if (rel === 6) {
                    interval6Count++;
                }
                if (rel === 9) {
                    interval9Count++;
                }
                if (rel === 2 || rel === 5 || rel === 6 || rel === 9) {
                    extensionCount++;
                }
            }
            return { interval6Count, interval9Count, extensionCount, totalNotes };
        };

        const m6 = tally(m6Chord);
        const dom7 = tally(dom7Chord);
        const alt = tally(altChord);

        const m6Interval9Rate = m6.interval9Count / Math.max(m6.totalNotes, 1);
        const dom7Interval6Rate = dom7.interval6Count / Math.max(dom7.totalNotes, 1);
        const dom7ExtensionRate = dom7.extensionCount / Math.max(dom7.totalNotes, 1);
        const altExtensionRate = alt.extensionCount / Math.max(alt.totalNotes, 1);

        console.log(
            '\n[Jazz Audit] Evans per-quality controls\n' +
                `  Cm6  : interval-9 ${(m6Interval9Rate * 100).toFixed(1)}% (n=${m6.totalNotes})\n` +
                `  C7   : interval-6 ${(dom7Interval6Rate * 100).toFixed(1)}% | ` +
                `all-extensions ${(dom7ExtensionRate * 100).toFixed(1)}% (n=${dom7.totalNotes})\n` +
                `  G7alt: all-extensions ${(altExtensionRate * 100).toFixed(1)}% (n=${alt.totalNotes})\n`,
        );

        // Sample sanity.
        expect(m6.totalNotes).toBeGreaterThan(100);
        expect(dom7.totalNotes).toBeGreaterThan(100);
        expect(alt.totalNotes).toBeGreaterThan(100);

        // Cm6 negative control: interval 9 must stay low. The min6 bucket
        // drops 9 specifically to prevent double-counting against the chord
        // tone — if a future change reverts min6 to {2, 5, 9}, the +60/×3.5
        // Evans multiplier stacks on the chord-tone bonus and interval 9
        // jumps to the 5-10% band (estimated by analogy to C7 interval 6's
        // 7.3%, since both are "extension present in bucket" scenarios).
        // Threshold 0.02 sits well above the deterministic 0.0% baseline
        // while halving the failure margin vs. a 0.05 ceiling.
        expect(m6Interval9Rate).toBeLessThan(0.02);

        // C7 positive control: interval 6 (#11/lydian-dominant color)
        // remains a legitimate Evans extension on dom7. Floor at 0.03 (vs
        // observed 7.3%) guards "this color survives at a musical rate"
        // rather than the weaker "interval 6 ever appeared" of a 0.005
        // floor — a regression that suppresses dom-interval-6 partially
        // (say to 1-2% via over-tuning) still trips.
        expect(dom7Interval6Rate).toBeGreaterThan(0.03);

        // G7alt suppression: alt bucket is empty, so the Evans boost never
        // fires on G7alt. Without the +60/×3.5 pull toward intervals 2/5/6/9,
        // the picker's chord-tone + scale-mask logic dominates and the
        // "extension class" landings drop notably below the C7 baseline.
        // This is the cleanest behavioral signal that the alt bucket is
        // actually empty (vs. silently inheriting the dom set).
        expect(altExtensionRate).toBeLessThan(dom7ExtensionRate);
    });
});

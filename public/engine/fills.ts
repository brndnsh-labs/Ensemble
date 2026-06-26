// Fill Generation Logic
// Uses block-based generation and templates for natural sounding fills

interface FillTemplate {
    steps: number[];
    instruments: string[];
    velocities: number[];
}

interface GenreFills {
    low: FillTemplate[];
    medium: FillTemplate[];
    high: FillTemplate[];
}

export const FILL_TEMPLATES: Record<string, GenreFills> = {
    Rock: {
        low: [
            // Simple snare hits on 4, 4&
            { steps: [12, 14], instruments: ['Snare', 'Snare'], velocities: [0.8, 0.7] },
            // Kick/Snare interplay
            {
                steps: [12, 13, 14],
                instruments: ['Kick', 'Snare', 'Snare'],
                velocities: [1.0, 0.7, 0.9],
            },
        ],
        medium: [
            // 8th note build
            {
                steps: [8, 10, 12, 14],
                instruments: ['Snare', 'Snare', 'Snare', 'Snare'],
                velocities: [0.6, 0.7, 0.8, 0.9],
            },
            // Tom-Snare movement
            {
                steps: [8, 10, 12, 14],
                instruments: ['High Tom', 'Mid Tom', 'Low Tom', 'Kick'],
                velocities: [0.8, 0.8, 0.9, 1.1],
            },
        ],
        high: [
            // 16th note roll
            {
                steps: [8, 9, 10, 11, 12, 13, 14, 15],
                instruments: [
                    'Snare',
                    'Snare',
                    'High Tom',
                    'High Tom',
                    'Mid Tom',
                    'Mid Tom',
                    'Low Tom',
                    'Low Tom',
                ],
                velocities: [0.5, 0.4, 0.6, 0.5, 0.7, 0.6, 0.9, 0.8],
            },
            // Flam-like accents (using Flam logic if engine supported, or just tight notes)
            {
                steps: [0, 2, 4, 6, 8, 10, 12, 14],
                instruments: ['Kick', 'Crash', 'Snare', 'Snare', 'Kick', 'Crash', 'Snare', 'Kick'],
                velocities: [1.2, 1.0, 0.9, 0.9, 1.2, 1.0, 1.0, 1.2],
            },
        ],
    },
    Funk: {
        low: [
            // Ghost note syncopation
            { steps: [13, 15], instruments: ['Snare', 'Snare'], velocities: [0.3, 0.4] },
            // Hi-hat open on upbeat
            { steps: [14], instruments: ['Open'], velocities: [0.8] },
        ],
        medium: [
            // Linear pattern
            {
                steps: [12, 13, 14, 15],
                instruments: ['Kick', 'Snare', 'Kick', 'Snare'],
                velocities: [0.9, 0.4, 0.9, 0.8],
            },
            // why: Funk tom-syncopation — Stubblefield/Brown idiom drops a
            // tight Mid→Low tom figure on the "e" and "&" of beat 4 (steps
            // 13/14) instead of a snare roll, then snaps back to the kick
            // on the "a" (step 15). Velocities sit just below the snare
            // backbeat so the fill reads as a drop, not a peak.
            {
                steps: [12, 13, 14, 15],
                instruments: ['Snare', 'Mid Tom', 'Low Tom', 'Kick'],
                velocities: [0.8, 0.85, 0.95, 1.05],
            },
        ],
        high: [
            // Syncopated 16ths
            {
                steps: [8, 10, 11, 13, 14],
                instruments: ['Snare', 'Snare', 'Kick', 'Snare', 'Kick'],
                velocities: [0.9, 0.4, 1.0, 0.9, 1.1],
            },
            // why: high-energy funk tom drop — a syncopated 16th figure that
            // weaves snare ghosts with Mid/Low toms in the second half of the
            // bar (Clyde Stubblefield "Funky Drummer" Bonham-influenced fill).
            // Final kick on 15 lands as the pickup into the next bar's "one".
            {
                steps: [8, 10, 11, 13, 14, 15],
                instruments: ['Snare', 'Mid Tom', 'Low Tom', 'Mid Tom', 'Low Tom', 'Kick'],
                velocities: [0.7, 0.85, 0.95, 0.9, 1.0, 1.1],
            },
        ],
    },
    Jazz: {
        low: [
            // Soft snare comping
            { steps: [11, 14], instruments: ['Snare', 'Snare'], velocities: [0.4, 0.5] },
        ],
        medium: [
            // Triplet feel on snare (mapped to 16ths roughly or Swing engine handles it)
            {
                steps: [8, 11, 14],
                instruments: ['Snare', 'Snare', 'Snare'],
                velocities: [0.5, 0.6, 0.7],
            },
        ],
        high: [
            // Busy snare/kick interaction
            {
                steps: [4, 7, 10, 13],
                instruments: ['Snare', 'Kick', 'Snare', 'Kick'],
                velocities: [0.7, 0.8, 0.8, 0.9],
            },
        ],
    },
    Blues: {
        low: [
            // Simple shuffle pickup (the 'and' of 4)
            { steps: [14], instruments: ['Snare'], velocities: [0.6] },
            // Kick pickup
            { steps: [14], instruments: ['Kick'], velocities: [0.8] },
        ],
        medium: [
            // Standard shuffle fill (3... and-4-and)
            {
                steps: [10, 12, 14],
                instruments: ['Snare', 'Snare', 'Snare'],
                velocities: [0.6, 0.7, 0.9],
            },
            // Kick support on the beat
            { steps: [12, 14], instruments: ['Kick', 'Snare'], velocities: [0.9, 0.8] },
            // why: Blues tom-down — H→M→L descent across steps 10/12/13
            // landing on a Snare backbeat at 14. The engine quantizes to
            // 16ths so the shuffle feel comes from the swing engine on top
            // of these grid positions, not from the steps themselves. Reads
            // like a Fred Below tom-down behind a Muddy Waters turnaround.
            {
                steps: [10, 12, 13, 14],
                instruments: ['High Tom', 'Mid Tom', 'Low Tom', 'Snare'],
                velocities: [0.7, 0.8, 0.9, 0.95],
            },
        ],
        high: [
            // Classic triplet-feel turnaround (on 8th grid: 3, 3&, 4, 4&)
            {
                steps: [8, 10, 12, 14],
                instruments: ['Snare', 'Kick', 'Snare', 'Crash'],
                velocities: [0.8, 0.9, 0.9, 1.1],
            },
            // Snare roll (8th notes only)
            {
                steps: [8, 10, 12, 14],
                instruments: ['Snare', 'Snare', 'Snare', 'Snare'],
                velocities: [0.7, 0.8, 0.9, 1.0],
            },
            // why: high-energy blues turnaround tom drop — descending tom
            // triplet (high→mid→low) on the 8th grid lands as a "ba-da-bum"
            // pickup into beat 1 with a Crash at the top. Classic 12-bar
            // turnaround punctuation (Stevie Ray Vaughan, "Pride and Joy").
            {
                steps: [8, 10, 12, 14, 15],
                instruments: ['High Tom', 'Mid Tom', 'Low Tom', 'Snare', 'Crash'],
                velocities: [0.75, 0.85, 0.95, 1.0, 1.15],
            },
        ],
    },
    Disco: {
        low: [
            // Open Hi-hat bark
            { steps: [14], instruments: ['Open'], velocities: [0.9] },
            // Snare pickup
            { steps: [12, 14], instruments: ['Snare', 'Snare'], velocities: [0.7, 0.8] },
        ],
        medium: [
            // Classic Disco roll (Snare build)
            {
                steps: [8, 10, 12, 13, 14, 15],
                instruments: ['Snare', 'Snare', 'Snare', 'Snare', 'Snare', 'Snare'],
                velocities: [0.6, 0.7, 0.8, 0.9, 0.9, 1.0],
            },
            // why: Disco tom tumble — descending H→M→L across the back half
            // of the bar, returning to snare on the "and-a" of beat 4. The
            // motion mimics the four-on-the-floor energy lift heard on Earth
            // Wind & Fire "September" / Chic fills.
            {
                steps: [8, 10, 12, 13, 14, 15],
                instruments: ['High Tom', 'Mid Tom', 'Low Tom', 'Snare', 'Snare', 'Open'],
                velocities: [0.75, 0.85, 0.95, 0.9, 1.0, 1.05],
            },
        ],
        high: [
            // 16th note chaos with open hats
            {
                steps: [8, 9, 10, 11, 12, 13, 14, 15],
                instruments: ['Snare', 'Kick', 'Snare', 'Kick', 'Snare', 'Open', 'Snare', 'Crash'],
                velocities: [0.8, 0.9, 0.9, 1.0, 1.0, 1.1, 1.1, 1.2],
            },
            // why: high-disco tom tumble — alternating 16ths between toms
            // (descending) and kick, then snare→Crash on the final 8th.
            // Reads as the "drop into the chorus" fill on a classic disco
            // track. Crash on 15 is the lift over the bar line.
            {
                steps: [8, 9, 10, 11, 12, 13, 14, 15],
                instruments: [
                    'High Tom',
                    'Kick',
                    'Mid Tom',
                    'Kick',
                    'Low Tom',
                    'Snare',
                    'Snare',
                    'Crash',
                ],
                velocities: [0.8, 0.9, 0.9, 1.0, 1.0, 1.05, 1.1, 1.2],
            },
        ],
    },
    Acoustic: {
        low: [
            { steps: [14], instruments: ['Kick'], velocities: [0.6] },
            { steps: [12, 14], instruments: ['Snare', 'Snare'], velocities: [0.4, 0.5] },
        ],
        medium: [
            {
                steps: [12, 13, 14, 15],
                instruments: ['Snare', 'Snare', 'Snare', 'Snare'],
                velocities: [0.4, 0.5, 0.6, 0.5],
            },
            {
                steps: [10, 12, 14],
                instruments: ['Kick', 'Snare', 'Kick'],
                velocities: [0.7, 0.6, 0.8],
            },
            // why: Acoustic softened tom phrase — sparse Mid-Tom hits at
            // ghost-velocity (~0.45) as a gentler alternative to a snare
            // roll. Suits singer-songwriter/folk territory where a snare
            // roll would be too rock-aggressive. Kick anchors beat 4.
            {
                steps: [10, 12, 14],
                instruments: ['Mid Tom', 'Mid Tom', 'Kick'],
                velocities: [0.45, 0.55, 0.75],
            },
        ],
        high: [
            {
                steps: [8, 10, 12, 14],
                instruments: ['Snare', 'Snare', 'Snare', 'Crash'],
                velocities: [0.6, 0.7, 0.8, 0.9],
            },
            // why: high-acoustic tom build — soft H→M→L descent leading
            // into a Snare on the "and-a" of beat 4. Velocities stay below
            // the Rock band so the fill feels human (not arena-rock). No
            // Crash here — acoustic high-intensity reads as a band peak,
            // not a stadium peak.
            {
                steps: [8, 10, 12, 14, 15],
                instruments: ['High Tom', 'Mid Tom', 'Low Tom', 'Snare', 'Snare'],
                velocities: [0.65, 0.75, 0.85, 0.9, 0.95],
            },
        ],
    },
    'Bossa Nova': {
        low: [{ steps: [14, 15], instruments: ['Snare', 'Snare'], velocities: [0.6, 0.4] }],
        medium: [
            {
                steps: [12, 13, 14, 15],
                instruments: ['Snare', 'High Tom', 'Mid Tom', 'Conga'],
                velocities: [0.7, 0.6, 0.7, 0.9],
            },
        ],
        high: [
            {
                steps: [8, 10, 12, 14, 15],
                instruments: ['High Tom', 'Conga', 'Mid Tom', 'Snare', 'Crash'],
                velocities: [0.6, 0.8, 0.7, 0.9, 1.1],
            },
        ],
    },
    Country: {
        // why: Country fills key off the "train-beat" idiom — continuous 16ths
        // on snare with rolling tom pickups into beat 1. Each level adds one
        // more tom event so the listener hears the fill grow as intensity
        // rises rather than collapsing to a snare roll (the prior Rock
        // fallback was too rock-aggressive for country contexts).
        low: [
            // Sparse Snare + Kick pickup — the "ba-dum" minimal country fill
            { steps: [14], instruments: ['Snare'], velocities: [0.7] },
            { steps: [12, 14], instruments: ['Kick', 'Snare'], velocities: [0.85, 0.8] },
        ],
        medium: [
            // Pure train-beat snare lead-in — the Nashville session-drummer
            // snare-fours pickup that defines country drumming as much as
            // the tom roll does. Without this, every medium fill plays
            // toms and the listener never hears a clean snare-only pickup.
            {
                steps: [10, 11, 12, 13, 14, 15],
                instruments: ['Snare', 'Snare', 'Snare', 'Snare', 'Snare', 'Kick'],
                velocities: [0.55, 0.65, 0.75, 0.8, 0.85, 1.0],
            },
            // Train-beat snare lead-in + Mid-Tom pickup on the "and-a" of 4
            {
                steps: [10, 12, 14, 15],
                instruments: ['Snare', 'Snare', 'Mid Tom', 'Low Tom'],
                velocities: [0.7, 0.8, 0.85, 0.95],
            },
            // Classic country tom roll into beat 1 — H→M→L→Kick (Nashville
            // session-drummer style, "King of the Road" lineage). This is
            // the genre-defining fill.
            {
                steps: [11, 12, 13, 14, 15],
                instruments: ['High Tom', 'High Tom', 'Mid Tom', 'Low Tom', 'Kick'],
                velocities: [0.7, 0.8, 0.85, 0.95, 1.05],
            },
        ],
        high: [
            // 16th-note train fill with full tom descent — the "Texas swing"
            // pickup into the next chorus. Crash on 15 marks the arrival.
            {
                steps: [8, 9, 10, 11, 12, 13, 14, 15],
                instruments: [
                    'Snare',
                    'Snare',
                    'High Tom',
                    'High Tom',
                    'Mid Tom',
                    'Mid Tom',
                    'Low Tom',
                    'Crash',
                ],
                velocities: [0.65, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0, 1.2],
            },
        ],
    },
    'Hip Hop': {
        // why: Hip-Hop fills favor sparse 808-style low-tom drops over
        // snare rolls. The genre's fill vocabulary is closer to a "boom →
        // boom → BOOM" pickup than a continuous build. Use Low Tom as the
        // primary tom voice (the closest in-engine analogue to an 808 tom).
        low: [
            // Boom-bap pickup — single LowTom on the "and" of 4
            { steps: [14], instruments: ['Low Tom'], velocities: [0.85] },
            // Snare pickup (fallback)
            { steps: [12, 14], instruments: ['Snare', 'Snare'], velocities: [0.6, 0.75] },
        ],
        medium: [
            // 808-style tom drop — Mid + Low on the back half of bar
            {
                steps: [10, 12, 14],
                instruments: ['Snare', 'Low Tom', 'Low Tom'],
                velocities: [0.7, 0.95, 1.05],
            },
            // Boom-bap variation — kick anchor + low-tom punctuation
            {
                steps: [12, 13, 14, 15],
                instruments: ['Kick', 'Snare', 'Low Tom', 'Kick'],
                velocities: [1.0, 0.7, 0.95, 1.05],
            },
        ],
        high: [
            // Trap tom drop — sparse, heavy LowTom hits over the back half
            // (modern trap producer tom drop). Crash on 15 marks the
            // section change. TODO: an 808-tagged sub voice would suit
            // hip-hop more authentically than Low Tom alone.
            {
                steps: [8, 10, 12, 13, 14, 15],
                instruments: ['Low Tom', 'Low Tom', 'Mid Tom', 'Low Tom', 'Low Tom', 'Crash'],
                velocities: [0.85, 0.95, 0.9, 1.0, 1.1, 1.2],
            },
        ],
    },
    'Neo-Soul': {
        // why: Neo-Soul fills sit between Hip-Hop's sparseness and Funk's
        // ghost-note density. Use Mid/Low toms at laid-back velocities to
        // keep the Dilla "drunken swing" feel — the displaced final tom
        // can punch through (peak ~1.0) but the body of the fill stays
        // ghosted. Phrases resolve into the snare backbeat rather than
        // peaking on a Crash.
        low: [
            // Ghosted Mid-Tom pickup on the "and-a" of 4
            { steps: [14, 15], instruments: ['Mid Tom', 'Snare'], velocities: [0.5, 0.6] },
            // Sidestick-and-tom — the laid-back conversational fill
            { steps: [12, 14], instruments: ['Sidestick', 'Mid Tom'], velocities: [0.55, 0.7] },
        ],
        medium: [
            // Mid+Low tom triplet feel mapped onto 8th grid — a Questlove
            // tom-down ("Voodoo"-era D'Angelo). Snare arrival on the "and"
            // of 4 lands the gesture without a Crash.
            {
                steps: [10, 12, 13, 14],
                instruments: ['Mid Tom', 'Low Tom', 'Mid Tom', 'Snare'],
                velocities: [0.7, 0.85, 0.75, 0.9],
            },
        ],
        high: [
            // Dilla-style tom-down fill — sparse-to-dense across the last
            // two beats, ending with a Snare on 14 + Low Tom on 15 (the
            // "displaced one" that pulls into the next bar's downbeat).
            {
                steps: [8, 10, 11, 12, 13, 14, 15],
                instruments: [
                    'High Tom',
                    'Mid Tom',
                    'Mid Tom',
                    'Low Tom',
                    'Snare',
                    'Snare',
                    'Low Tom',
                ],
                velocities: [0.7, 0.8, 0.75, 0.9, 0.85, 0.95, 1.0],
            },
        ],
    },
    // why: keyed 'Ska' — the lookup is FILL_TEMPLATES[genreFeel] and the Ska-Punk
    // genre's genreFeel is 'Ska' (smart-genres.ts). Was 'Ska-Punk' (the preset
    // name), a dead key that fell back to Rock fills. Epic 2 S2.
    Ska: {
        low: [
            {
                steps: [12, 14, 15],
                instruments: ['Snare', 'Snare', 'Snare'],
                velocities: [0.8, 0.9, 1.1],
            },
        ],
        medium: [
            {
                steps: [8, 10, 12, 13, 14, 15],
                instruments: ['Snare', 'Snare', 'Snare', 'Snare', 'Snare', 'Crash'],
                velocities: [0.6, 0.7, 0.8, 0.9, 1.0, 1.2],
            },
            // why: epic-deferred-followups S8(a) — Ska-Punk tom fill. The
            // Travis Barker / Tim Armstrong vocabulary is tom-laden: a fast
            // H→M→L descent across the back of the bar, the fill displacing
            // the final two skank upstrokes (steps 10/14). Velocities ride hot
            // (the genre plays loud) and the final Low Tom lands as the pickup
            // into the next bar's "one".
            {
                steps: [10, 11, 12, 13, 14, 15],
                instruments: ['High Tom', 'High Tom', 'Mid Tom', 'Mid Tom', 'Low Tom', 'Low Tom'],
                velocities: [0.85, 0.9, 0.95, 1.0, 1.05, 1.15],
            },
        ],
        high: [
            {
                steps: [0, 2, 4, 6, 8, 10, 12, 14],
                instruments: ['Kick', 'Crash', 'Kick', 'Crash', 'Kick', 'Crash', 'Snare', 'Crash'],
                velocities: [1.2, 1.1, 1.2, 1.1, 1.2, 1.1, 1.2, 1.3],
            },
            // why: S8(a) — high-energy Ska-Punk tom blitz. A 16th-note
            // snare→tom descent (Barker "fast-fill" idiom) that tumbles down
            // the kit and slams a Crash over the bar line. Toms interleave
            // with snare so the fill reads as a frantic punk roll, not a
            // metronomic tom-tom march.
            {
                steps: [8, 9, 10, 11, 12, 13, 14, 15],
                instruments: [
                    'Snare',
                    'High Tom',
                    'Snare',
                    'Mid Tom',
                    'Snare',
                    'Low Tom',
                    'Low Tom',
                    'Crash',
                ],
                velocities: [0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.25],
            },
        ],
    },
    Reggae: {
        // why: S8(a) — Reggae was trimmed from the Epic 7 S4 tom-template
        // sweep, but the One Drop has real tom vocabulary. The defining
        // gesture is the beat-1 silence (no kick/snare on the One) — Carlton
        // Barrett famously walked a tom-down OUT of that gap. These templates
        // keep the back-of-bar emphasis and resolve toward (not over) the
        // empty downbeat that follows.
        low: [
            // Sparse rim/snare pickup — minimal One Drop fill
            { steps: [14], instruments: ['Snare'], velocities: [0.6] },
            { steps: [12, 14], instruments: ['Sidestick', 'Snare'], velocities: [0.5, 0.65] },
        ],
        medium: [
            // Carlton Barrett tom-down — a relaxed H→M→L descent across the
            // back half of the bar landing a Mid Tom on the "and" of 4. The
            // gesture walks INTO the next bar's silent One, so it resolves
            // soft (no Crash, no kick punch) — the empty downbeat is the
            // payoff, not a cymbal splash.
            {
                steps: [10, 12, 14],
                instruments: ['High Tom', 'Mid Tom', 'Low Tom'],
                velocities: [0.7, 0.75, 0.8],
            },
            // Snare-led pickup with a single Mid Tom punctuation — the
            // "talking" One Drop fill that keeps the rim feel.
            {
                steps: [11, 13, 14, 15],
                instruments: ['Sidestick', 'Mid Tom', 'Low Tom', 'Snare'],
                velocities: [0.6, 0.75, 0.8, 0.7],
            },
        ],
        high: [
            // High-energy One Drop tom roll — a fuller H→M→L tumble on the
            // 8th grid. Still resolves to a Snare (not a Crash) so the
            // following silent downbeat reads as the drop, the way a roots
            // drummer (Sly Dunbar) phrases a section change.
            {
                steps: [8, 10, 12, 13, 14, 15],
                instruments: ['High Tom', 'High Tom', 'Mid Tom', 'Mid Tom', 'Low Tom', 'Snare'],
                velocities: [0.75, 0.8, 0.85, 0.9, 0.95, 0.85],
            },
        ],
    },
    // why: Metal had NO entry and fell back to Rock fills (Epic 2 S2). Metal
    // fills are tom-and-double-kick driven and resolve hot over the bar line on a
    // Crash — louder and busier than Rock, with double-bass kick gallops woven
    // under the toms rather than Rock's snare-led builds.
    Metal: {
        low: [
            // Kick-snare gallop into the next bar — the half-time-feel "chug" fill.
            {
                steps: [12, 13, 14, 15],
                instruments: ['Kick', 'Snare', 'Kick', 'Snare'],
                velocities: [1.1, 0.9, 1.15, 1.0],
            },
        ],
        medium: [
            // Tom descent over a steady double-kick pulse, Crash over the bar line.
            {
                steps: [8, 9, 10, 11, 12, 13, 14, 15],
                instruments: [
                    'High Tom',
                    'Kick',
                    'Mid Tom',
                    'Kick',
                    'Low Tom',
                    'Kick',
                    'Low Tom',
                    'Crash',
                ],
                velocities: [0.9, 1.0, 0.95, 1.0, 1.0, 1.05, 1.05, 1.25],
            },
            // Straight H→M→L tom roll slamming a Crash — the simpler section-cap fill.
            {
                steps: [8, 10, 12, 14],
                instruments: ['High Tom', 'Mid Tom', 'Low Tom', 'Crash'],
                velocities: [0.95, 1.0, 1.05, 1.25],
            },
        ],
        high: [
            // 16th blast-beat — alternating snare/double-kick tumbling into a Crash
            // slam over the downbeat. The frantic, full-bar metal "lead-in to the
            // breakdown" gesture.
            {
                steps: [8, 9, 10, 11, 12, 13, 14, 15],
                instruments: [
                    'Snare',
                    'Kick',
                    'Snare',
                    'Kick',
                    'Snare',
                    'Kick',
                    'Low Tom',
                    'Crash',
                ],
                velocities: [1.0, 1.1, 1.0, 1.1, 1.05, 1.15, 1.1, 1.3],
            },
            // Full kit tom tumble with a kick punch and Crash payoff — the
            // "down-the-toms" climax roll.
            {
                steps: [8, 9, 10, 11, 12, 13, 14, 15],
                instruments: [
                    'High Tom',
                    'High Tom',
                    'Mid Tom',
                    'Mid Tom',
                    'Low Tom',
                    'Low Tom',
                    'Kick',
                    'Crash',
                ],
                velocities: [0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.3],
            },
        ],
    },
};

export function generateProceduralFill(
    genre: string,
    intensity: number,
    stepsPerMeasure: number,
    prng: () => number = Math.random,
): Record<number, { name: string; vel: number }[]> {
    return generateDeterministicFill(genre, intensity, stepsPerMeasure, prng);
}

/**
 * A short, within-section "breathing" pickup — a brief snare lead-in on the
 * FINAL beat of a phrase (every few bars), distinct from the bigger
 * section-transition fill. This is what keeps a real drummer's 4-bar phrasing
 * alive between section changes: a couple of climbing 16ths into the next
 * downbeat, no crash, no full-bar tom tumble.
 *
 * `seed` (0..1, deterministic per section+bar) picks the variant so looped
 * playback stays coherent rather than re-rolling each pass. Returns fill-steps
 * keyed RELATIVE to the pickup window (0..stepsPerBeat-1); trigger it with a
 * `fillStartStep` landing on the bar's last beat and `fillLength = stepsPerBeat`.
 */
export function generatePhrasePickup(
    stepsPerBeat: number,
    intensity: number,
    seed: number,
): Record<number, { name: string; vel: number }[]> {
    const fill: Record<number, { name: string; vel: number }[]> = {};
    // Velocity climbs into the downbeat; scaled by band intensity so a quiet
    // section breathes softly and a hot one pushes harder. Kept below the
    // backbeat's own crack (≈0.9+) so the pickup leads in, never overpowers.
    const baseVel = 0.4 + intensity * 0.25; // 0.4..0.65

    if (stepsPerBeat < 2) {
        // Single-subdivision beat (exotic meter) — one ghosted snare lead-in.
        fill[Math.max(0, stepsPerBeat - 1)] = [{ name: 'Snare', vel: baseVel }];
        return fill;
    }

    // The pickup occupies the final `stepsPerBeat` subdivisions before the
    // downbeat. In simple meter (stepsPerBeat 4) that's the '&'/'a' of the beat;
    // in compound meter (stepsPerBeat 2) it's the last two eighths of the final
    // grouping — either way these are the subdivisions immediately leading into
    // the next bar's "one", which is what makes it read as a pickup.
    const last = stepsPerBeat - 1; // final subdivision → straight into the downbeat
    const penult = stepsPerBeat - 2; // the subdivision before it

    if (seed < 0.55) {
        // Default: an understated two-note snare hinge — the most common,
        // tasteful phrase lead-in a session player throws every few bars.
        fill[penult] = [{ name: 'Snare', vel: baseVel }];
        fill[last] = [{ name: 'Snare', vel: baseVel + 0.15 }];
    } else if (seed < 0.85 && stepsPerBeat >= 4) {
        // Busier 16th snare flurry across the back half of the beat (4/4-ish
        // only — needs the subdivisions). Reads as a slightly hotter lead-in.
        fill[stepsPerBeat - 3] = [{ name: 'Snare', vel: baseVel - 0.05 }];
        fill[penult] = [{ name: 'Snare', vel: baseVel + 0.05 }];
        fill[last] = [{ name: 'Snare', vel: baseVel + 0.2 }];
    } else {
        // Color variant: a small snare→tom turn for a touch of pitch movement
        // into the downbeat without committing to a full tom run.
        fill[penult] = [{ name: 'Snare', vel: baseVel }];
        fill[last] = [{ name: 'Mid Tom', vel: baseVel + 0.1 }];
    }

    return fill;
}

export function generateDeterministicFill(
    genre: string,
    intensity: number,
    stepsPerMeasure: number,
    prng: () => number,
): Record<number, { name: string; vel: number }[]> {
    const fill: Record<number, { name: string; vel: number }[]> = {};
    const templates = FILL_TEMPLATES[genre] || FILL_TEMPLATES.Rock;

    let level: 'low' | 'medium' | 'high' = 'low';
    if (intensity > 0.4) {
        level = 'medium';
    }
    if (intensity > 0.75) {
        level = 'high';
    }

    const options = templates[level];
    if (!options || options.length === 0) {
        return fill;
    }

    // Pick a deterministic template
    const template = options[Math.floor(prng() * options.length)];

    // Apply template to the LAST beat(s) of the measure
    // Templates use steps relative to a standard 16-step measure (ending at 15).
    // We shift them to align with the actual stepsPerMeasure.
    const offset = stepsPerMeasure - 16;

    template.steps.forEach((stepIdx, i) => {
        const inst = template.instruments[i];
        const vel = template.velocities[i];

        const actualStep = stepIdx + offset;

        // Ensure we don't produce negative steps if the measure is super short
        if (actualStep >= 0 && actualStep < stepsPerMeasure) {
            if (!fill[actualStep]) {
                fill[actualStep] = [];
            }
            fill[actualStep].push({ name: inst, vel });
        }
    });

    return fill;
}

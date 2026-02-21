import { getState } from '../state.js';

/**
 * Applies procedural groove logic based on the active genre and band intensity.
 * @param {Object} params - The current step parameters.
 * @returns {Object} { shouldPlay, velocity, soundName, instTimeOffset }
 */
export function applyGrooveOverrides({
    step,
    inst,
    stepVal,
    playback,
    groove,
    isDownbeat,
    isQuarter,
    isBackbeat,
    isGroupStart,
}) {
    const { soloist } = getState();
    let instTimeOffset = 0;
    let velocity = stepVal === 2 ? 1.25 : 0.9;
    let shouldPlay = stepVal > 0;
    let soundName = inst.name;
    const loopStep = step % 16;

    // Creativity drives the internal complexity of the drum engine
    const drumComplexity = groove.creativity ? 0.8 : 0.3;

    // --- Neo-Soul "Dilla" Quantization Mismatch ---
    if (groove.genreFeel === 'Neo-Soul' || groove.genreFeel === 'Hip Hop') {
        // Hats push forward (straighter), Snare drags back (lazier)
        if (inst.name === 'HiHat' || inst.name === 'Open') {
            instTimeOffset -= 0.012;
        }
        if (inst.name === 'Snare') {
            instTimeOffset += 0.008;
        }
    }

    // --- Neo-Soul / Hip Hop Procedural Overrides ---
    if ((groove.genreFeel === 'Neo-Soul' || groove.genreFeel === 'Hip Hop') && !inst.muted) {
        // 1. "Drunken" Pocket (Varying displacement based on intensity) - TIGHTENED
        const drunkenFactor = playback.bandIntensity * 0.012;
        if (loopStep % 4 !== 0) {
            instTimeOffset += (Math.random() - 0.5) * drunkenFactor;
        }

        // 2. Ghost Note "Peeling" (Density increases with intensity and complexity)
        if (inst.name === 'Snare' && stepVal === 0) {
            const ghostProb = 0.1 + playback.bandIntensity * 0.3 + drumComplexity * 0.2;
            if (Math.random() < ghostProb && [2, 3, 6, 7, 10, 11, 14, 15].includes(loopStep)) {
                shouldPlay = true;
                velocity = 0.15 + Math.random() * 0.1;
                instTimeOffset += 0.008; // Reduced drag
            }
        }

        // 3. Lazy Snare displacement at high intensity - TIGHTENED
        if (
            inst.name === 'Snare' &&
            (loopStep === 4 || loopStep === 12) &&
            playback.bandIntensity > 0.75
        ) {
            instTimeOffset += 0.012; // Reduced late "crack"
            velocity *= 1.1;
        }

        // 4. "Skippy" Kick Variations
        if (inst.name === 'Kick') {
            const skipProb = 0.1 + playback.bandIntensity * 0.35;
            if (
                (loopStep === 3 || loopStep === 11 || loopStep === 15) &&
                Math.random() < skipProb
            ) {
                shouldPlay = true;
                velocity = 0.55 + Math.random() * 0.15;
            }
        }
    }

    // --- Acoustic / Percussive Overrides ---
    if (groove.genreFeel === 'Acoustic' && !inst.muted) {
        // Simulate a Cajon or hand-percussion feel
        if (inst.name === 'Snare') {
            // High intensity = "Slap" sound (Snare), Low intensity = "Rim/Tap" (Sidestick)
            soundName = playback.bandIntensity > 0.5 ? 'Snare' : 'Sidestick';

            // Add subtle mid-phrase taps as intensity builds
            if (stepVal === 0) {
                const tapProb = playback.bandIntensity * 0.35;
                if (Math.random() < tapProb && loopStep % 2 === 1) {
                    shouldPlay = true;
                    velocity = 0.2 + Math.random() * 0.15;
                    soundName = 'Sidestick';
                }
            }
        }

        if (inst.name === 'Kick') {
            // Keep it foundational but add "double-thump" at high intensity
            if (loopStep === 10 && playback.bandIntensity > 0.65 && Math.random() < 0.4) {
                shouldPlay = true;
                velocity = 0.7;
            }
        }

        if (inst.name === 'HiHat') {
            // Shaker-like behavior (varying velocity on 16ths)
            if (loopStep % 2 === 1) {
                velocity *= 0.7;
            }
            if (playback.bandIntensity < 0.3) {
                // Very sparse hats at low intensity
                if (loopStep % 4 !== 0) {
                    shouldPlay = false;
                }
            }
        }
    }

    // --- Funk Procedural Overrides ---
    if (groove.genreFeel === 'Funk' && !inst.muted) {
        // 1. Intelligent Snare Ghosting (Linear Style)
        if (inst.name === 'Snare' && stepVal === 0) {
            const isSubdivision = loopStep % 2 === 1; // Prioritize e and ah
            if (isSubdivision) {
                const kickInst = groove.instruments.find((i) => i.name === 'Kick');
                const kickPlaying =
                    kickInst &&
                    (kickInst.steps[step] > 0 || (loopStep === 0 && playback.bandIntensity > 0.8));

                let ghostProb = 0.15 + drumComplexity * 0.4;
                if (playback.bpm > 160) {
                    ghostProb *= 0.4;
                }

                // Avoid ghosting if kick is playing or about to play (tight linear feel)
                if (!kickPlaying && Math.random() < ghostProb) {
                    shouldPlay = true;
                    velocity = 0.12 + Math.random() * 0.1;
                }
            }
        }

        // 2. Dynamic Hi-Hat Barks & Transitions
        if (inst.name === 'HiHat' && shouldPlay) {
            const barkProb = playback.bandIntensity * 0.4;
            // Anticipatory bark leading to "The One" (step 14) or offbeat funk bark (step 3/11)
            if ([3, 11, 14].includes(loopStep) && Math.random() < barkProb) {
                soundName = 'Open';
                velocity *= 1.15;
            }
        }

        // 3. Procedural "The One" Reinforcement
        if (inst.name === 'Kick' && loopStep === 0 && playback.bandIntensity > 0.8 && !shouldPlay) {
            shouldPlay = true;
            velocity = 1.3;
        }

        // 4. Syncopated Kick "Hiccups"
        if (inst.name === 'Kick' && stepVal === 0 && drumComplexity > 0.6) {
            // Add skippy kick on "a" of 2 or "e" of 3
            if (
                (loopStep === 7 || loopStep === 9) &&
                Math.random() < playback.bandIntensity * 0.3
            ) {
                shouldPlay = true;
                velocity = 0.7;
            }
        }
    }

    // --- Disco Procedural Overrides ---
    if (groove.genreFeel === 'Disco' && !inst.muted) {
        // 1. Four-on-the-Floor Kick
        if (inst.name === 'Kick') {
            shouldPlay = loopStep % 4 === 0;
            if (shouldPlay) {
                velocity = loopStep === 0 ? 1.2 : 1.1;
            }
        }

        // 2. Backbeat Snare
        if (inst.name === 'Snare') {
            shouldPlay = loopStep === 4 || loopStep === 12;
            if (shouldPlay) {
                velocity = 1.15;
            }
            if (loopStep === 15 && Math.random() < 0.2) {
                shouldPlay = true;
                velocity = 0.4;
            }
        }

        // 3. Offbeat Hi-Hat Breathing
        if (inst.name === 'HiHat' || inst.name === 'Open') {
            shouldPlay = false;
            if (loopStep % 4 === 2) {
                shouldPlay = true;
                if (playback.bandIntensity > 0.6) {
                    soundName = 'Open';
                    velocity = 1.1;
                } else {
                    soundName = 'HiHat';
                    velocity = 0.9;
                }
            }
            if (loopStep % 2 === 1) {
                const discoCompProb = 0.4 + drumComplexity * 0.4; // Scales from 0.4 to 0.8
                if (Math.random() < discoCompProb) {
                    shouldPlay = true;
                    soundName = 'HiHat';
                    velocity = 0.5;
                }
            }
        }
    }

    // --- Reggae Procedural Overrides ---
    if (groove.genreFeel === 'Reggae' && !inst.muted) {
        if (inst.name === 'Kick') {
            if (playback.bandIntensity > 0.7) {
                shouldPlay = loopStep % 4 === 0;
                if (shouldPlay) {
                    velocity = 1.15;
                }
            } else if (playback.bandIntensity > 0.45) {
                if (loopStep === 0) {
                    shouldPlay = true;
                    velocity = 1.1;
                }
                if (loopStep === 8) {
                    shouldPlay = true;
                    velocity = 1.15;
                }
            }
        }
    }

    // --- Jazz Procedural Overrides ---
    if (groove.genreFeel === 'Jazz' && !inst.muted) {
        const isSoloistBusy = soloist.enabled && soloist.busySteps > 0;

        if (inst.name === 'Open') {
            shouldPlay = false;
            // Standard Ride Pattern: 1, 2, 2-a, 3, 4, 4-a
            const rideSteps = [0, 4, 6, 8, 12, 14];
            if (rideSteps.includes(loopStep)) {
                // Procedural Ride Variation: Occasionally skip the 'a' or accent the 'and'
                const isSkipBeat = loopStep === 6 || loopStep === 14;
                let rideProb = 1.0;
                if (isSkipBeat && drumComplexity < 0.4) {
                    rideProb = 0.7; // Simpler ride at low complexity
                }

                if (Math.random() < rideProb) {
                    shouldPlay = true;
                    // Velocity contour: Strong 1 and 3
                    if (loopStep % 8 === 0) {
                        velocity = 1.1 + playback.bandIntensity * 0.2;
                    } else {
                        velocity = 0.75 + drumComplexity * 0.15;
                    }
                }
            }

            // High BPM: Flatten the pattern to reduce wash
            if (playback.bpm > 180 && (loopStep === 6 || loopStep === 14) && Math.random() < 0.4) {
                shouldPlay = false;
            }
        } else if (inst.name === 'HiHat') {
            // Foot pedal on 2 and 4
            shouldPlay = false;
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
                velocity = 0.8 + playback.bandIntensity * 0.2;
            }
        } else if (inst.name === 'Kick') {
            shouldPlay = false;
            // 1. Feathering (The heartbeat) - low velocity on quarters
            if (loopStep % 4 === 0) {
                shouldPlay = true;
                velocity = 0.3 + playback.bandIntensity * 0.15;
            }

            // 2. Bombs (Interaction)
            let bombProb = playback.bandIntensity * 0.25;
            if (isSoloistBusy) {
                bombProb *= 1.5; // More bombs to support a busy soloist
            }
            if (playback.bpm > 170) {
                bombProb *= 0.4;
            }

            if (Math.random() < bombProb) {
                // Typical bomb placements: & of 2, & of 4, or the 'a' of 4
                if ([6, 14, 15].includes(loopStep)) {
                    shouldPlay = true;
                    velocity = 0.9 + Math.random() * 0.3;
                }
            }
        } else if (inst.name === 'Snare') {
            shouldPlay = false;

            // CONVERSATIONAL COMPING: If soloist is resting, drummer "fills the gap"
            let compProb = 0.1 + drumComplexity * 0.3;
            if (!isSoloistBusy) {
                compProb += 0.2; // Increase activity during soloist breath
            }
            if (playback.bpm > 175) {
                compProb *= 0.5;
            }

            // Placement logic
            if (loopStep === 14) {
                // & of 4 (Strongest jazz syncopation)
                if (Math.random() < 0.5 + compProb) {
                    shouldPlay = true;
                }
            } else if (loopStep === 6) {
                // & of 2
                if (Math.random() < 0.3 + compProb) {
                    shouldPlay = true;
                }
            } else if ([3, 11, 15].includes(loopStep)) {
                // Ghost/Syncopated chatter
                if (Math.random() < compProb * 0.4) {
                    shouldPlay = true;
                }
            }

            if (shouldPlay) {
                velocity = 0.4 + playback.bandIntensity * 0.6;
                // Low intensity simulation (Sidestick/Brushes approximation)
                if (playback.bandIntensity < 0.4) {
                    soundName = 'Sidestick';
                    velocity *= 0.8;
                }
            }

            // 3. THE BIG FINISH (Ending Signaling)
            if (playback.songMode && playback.isEndingPending && !inst.muted) {
                const endingStep = step % 16;
                // Add flams and rolls in the last 2 bars
                if ([13, 15].includes(endingStep) && Math.random() < 0.7) {
                    shouldPlay = true;
                    velocity = 1.1;
                    instTimeOffset -= 0.005; // Slightly rushed flam feel
                }
            }
        }
    }

    // --- Blues Procedural Overrides ---
    if (groove.genreFeel === 'Blues' && !inst.muted) {
        if (inst.name === 'HiHat') {
            shouldPlay = false;
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
                velocity = 0.85;
            }
        } else if (inst.name === 'Open') {
            shouldPlay = false;
            if (loopStep % 4 === 0) {
                shouldPlay = true;
                velocity = 1.1;
            } else if (loopStep % 2 === 0) {
                const skipProb = 0.4 + playback.bandIntensity * 0.5;
                if (Math.random() < skipProb) {
                    shouldPlay = true;
                    velocity = 0.7;
                }
            }
        } else if (inst.name === 'Kick') {
            if (loopStep === 0) {
                shouldPlay = true;
                velocity = 1.2;
            }
            // Add skippy kick on "and" of 2 (step 6)
            if (loopStep === 6 && playback.bandIntensity > 0.6 && Math.random() < 0.3) {
                shouldPlay = true;
                velocity = 0.8;
            }
        } else if (inst.name === 'Snare') {
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
                velocity = 1.1;
            }
            // 1. Procedural Snare "Drags" (Ghost notes leading into backbeats)
            if (stepVal === 0 && [3, 11].includes(loopStep) && drumComplexity > 0.5) {
                if (Math.random() < 0.2 + playback.bandIntensity * 0.4) {
                    shouldPlay = true;
                    velocity = 0.15 + Math.random() * 0.1;
                    instTimeOffset += 0.005; // Drag slightly
                }
            }
        }
    }

    // --- Latin / World Procedural Overrides ---
    const isLatinStyle =
        groove.genreFeel === 'Bossa Nova' ||
        ['Bossa Nova', 'Latin/Salsa', 'Afro-Cuban 6/8', 'Samba'].includes(groove.lastDrumPreset) ||
        groove.lastSmartGenre === 'Bossa';

    if (isLatinStyle) {
        if (inst.name === 'Conga') {
            // Randomly switch between CongaHigh (Open), CongaSlap, and CongaMute
            const slapProb = 0.1 + playback.bandIntensity * 0.4;
            const muteProb = 0.2;
            const rand = Math.random();
            if (rand < slapProb) {
                soundName = 'CongaHighSlap';
            } else if (rand < slapProb + muteProb) {
                soundName = 'CongaHighMute';
            } else {
                soundName = 'CongaHigh';
            }

            // Subtle ghosting
            if (stepVal === 0 && Math.random() < playback.bandIntensity * 0.2) {
                shouldPlay = true;
                velocity = 0.2;
                soundName = 'CongaHighMute';
            }
        }

        if (inst.name === 'Bongo') {
            soundName = loopStep % 8 < 4 ? 'BongoHigh' : 'BongoLow';
            if (Math.random() < 0.2) {
                velocity *= 0.8;
            }
        }

        if (inst.name === 'Clave') {
            instTimeOffset += (Math.random() - 0.5) * 0.005; // Tight humanization
        }

        if (inst.name === 'Perc') {
            // Agogo high/low variation based on accents
            if (stepVal === 2) {
                soundName = 'AgogoHigh';
                velocity *= 1.1;
            } else {
                soundName = 'AgogoLow';
                velocity *= 0.9;
            }
        }

        if (inst.name === 'Shaker') {
            // 1. Procedural Layer: If intensity is high enough, Shaker plays even if not in grid
            if (playback.bandIntensity > 0.3 && groove.lastSmartGenre === 'Bossa') {
                shouldPlay = true;
                // Steady 16th note pattern with "push/pull" velocity
                velocity = loopStep % 2 === 0 ? 0.7 : 0.4;
                velocity *= 0.8 + Math.random() * 0.4; // High humanization
            } else if (stepVal > 0) {
                // 2. Grid Overrides: Accent the "push" (8th notes) and vary the "pull" (16ths)
                if (loopStep % 2 === 1) {
                    velocity *= 0.65 + Math.random() * 0.15;
                } else {
                    velocity *= 1.1;
                }
            }
        }

        if (inst.name === 'Guiro') {
            // 1. Procedural Layer: Add occasional scrapes at high intensity
            if (playback.bandIntensity > 0.6 && groove.lastSmartGenre === 'Bossa') {
                if (loopStep === 4 || loopStep === 12) {
                    shouldPlay = true;
                    velocity = 0.5 * (0.8 + Math.random() * 0.4);
                }
            }
            // 2. Grid Overrides: Slight lag for the scrape pull
            if (shouldPlay && loopStep % 4 === 2) {
                instTimeOffset += 0.005;
            }
        }

        if (
            inst.name === 'High Tom' &&
            stepVal === 0 &&
            groove.lastSmartGenre === 'Bossa' &&
            playback.bandIntensity > 0.75
        ) {
            // Add occasional Tom "surdo" style accents on beat 3/4
            if (loopStep === 10 || loopStep === 14) {
                if (Math.random() < 0.2) {
                    shouldPlay = true;
                    velocity = 0.6;
                }
            }
        }
    }

    // --- GENRE-AUTHENTIC ENTROPY (Creativity Mode) ---
    if (
        groove.creativity &&
        !inst.muted &&
        !shouldPlay &&
        Math.random() < playback.bandIntensity * 0.15
    ) {
        // Only add entropy on non-primary steps to avoid clashing with the "core" of the genre
        const isSyncopated = loopStep % 2 === 1;
        const isHeavySync = loopStep % 4 === 2;

        if (inst.name === 'Snare' && isSyncopated) {
            shouldPlay = true;
            velocity = 0.1 + Math.random() * 0.15;
            soundName = playback.bandIntensity < 0.4 ? 'Sidestick' : 'Snare';
        } else if ((inst.name === 'HiHat' || inst.name === 'Open') && isHeavySync) {
            shouldPlay = true;
            velocity = 0.2 + Math.random() * 0.2;
            soundName = 'HiHat';
        }
    }

    // --- Global Timing & Gain Adjustments ---
    if (shouldPlay && !inst.muted) {
        if (groove.genreFeel === 'Funk' && (inst.name === 'HiHat' || inst.name === 'Open')) {
            if (stepVal === 2 && playback.bandIntensity > 0.6) {
                velocity = 1.0;
            } else if (stepVal !== 2) {
                velocity = Math.min(velocity, 0.75);
            }
        }

        if (groove.genreFeel === 'Neo-Soul' || groove.genreFeel === 'Hip Hop') {
            velocity *= 0.75;
        }

        if (inst.name === 'Snare') {
            if (groove.lastDrumPreset === 'Bossa Nova') {
                soundName = 'Sidestick';
                const bossaStep = step % 32;
                if (
                    playback.bandIntensity > 0.5 &&
                    (bossaStep === 7 || bossaStep === 23) &&
                    Math.random() < 0.2
                ) {
                    shouldPlay = true;
                    velocity = 0.6;
                }
                if (bossaStep === 31 && Math.random() < 0.2) {
                    shouldPlay = true;
                    velocity = 0.45;
                }
            } else if (groove.genreFeel === 'Acoustic') {
                soundName = playback.bandIntensity > 0.7 ? 'Snare' : 'Sidestick';
            } else if (playback.bandIntensity < 0.35 && groove.genreFeel !== 'Rock') {
                soundName = 'Sidestick';
            }
        }

        if (groove.genreFeel === 'Rock') {
            if (inst.name === 'HiHat' || inst.name === 'Open') {
                if (loopStep % 4 === 0) {
                    velocity *= 1.05;
                } else if (loopStep % 4 === 2) {
                    velocity *= 0.95;
                }
            }
            if (
                inst.name === 'Kick' &&
                loopStep === 10 &&
                playback.bandIntensity > 0.4 &&
                Math.random() < 0.25
            ) {
                shouldPlay = true;
                velocity = 0.9;
            }
            if (
                inst.name === 'Snare' &&
                !shouldPlay &&
                (loopStep === 7 || loopStep === 9) &&
                playback.bandIntensity > 0.35 &&
                playback.bandIntensity < 0.75 &&
                Math.random() < 0.12
            ) {
                shouldPlay = true;
                velocity = 0.35;
            }

            if (playback.bandIntensity > 0.7) {
                if (inst.name === 'HiHat' && shouldPlay) {
                    soundName = 'Open';
                    velocity *= 1.1;
                }
                if (inst.name === 'Snare' && shouldPlay) {
                    velocity *= 1.15;
                }
                if (inst.name === 'Kick' && isDownbeat) {
                    velocity *= 1.25;
                }
            } else if (playback.bandIntensity < 0.4) {
                if (inst.name === 'Snare' && shouldPlay) {
                    velocity *= 0.85;
                    if (playback.bandIntensity < 0.25) {
                        soundName = 'Sidestick';
                    }
                }
                if (inst.name === 'HiHat') {
                    velocity *= 0.8;
                }
                if (inst.name === 'Kick' && !isDownbeat) {
                    velocity *= 0.7;
                }
            } else {
                if (inst.name === 'Kick' && isDownbeat) {
                    velocity *= 1.2;
                }
                if (inst.name === 'Snare' && isBackbeat) {
                    velocity *= 1.2;
                }
            }
        } else if (groove.genreFeel === 'Funk' && stepVal === 2) {
            velocity *= 1.1;
        }

        // --- Funk Driving Feel (Timing Push) ---
        if (
            groove.genreFeel === 'Funk' &&
            inst.name === 'Snare' &&
            (loopStep === 4 || loopStep === 12)
        ) {
            instTimeOffset -= 0.004; // Drive the backbeat slightly
        }

        if (groove.genreFeel === 'Disco' && inst.name === 'Open') {
            velocity *= 1.15;
        }

        // --- Ska-Punk Final Polish ---
        if (groove.genreFeel === 'Ska-Punk' && !inst.muted) {
            instTimeOffset -= 0.005; // Pushing ahead for high energy
            if (inst.name === 'HiHat' || inst.name === 'Open') {
                if (loopStep % 4 === 2) {
                    velocity *= 1.35; // Strong offbeat accent
                    if (playback.bandIntensity > 0.6 && Math.random() < 0.3) {
                        soundName = 'Open';
                        velocity *= 1.1;
                    }
                } else {
                    velocity *= 0.85;
                }
            }
            if (inst.name === 'Snare' && (loopStep === 4 || loopStep === 12)) {
                velocity *= 1.1;
            }
        }

        if (
            inst.name === 'HiHat' &&
            groove.genreFeel !== 'Jazz' &&
            playback.bandIntensity > 0.8 &&
            isQuarter
        ) {
            soundName = 'Open';
            velocity *= 1.1;
        }
        if (inst.name === 'Kick') {
            velocity *= isDownbeat ? 1.15 : isGroupStart ? 1.1 : isQuarter ? 1.05 : 0.9;
        } else if (inst.name === 'Snare') {
            velocity *= isBackbeat ? 1.1 : 0.9;
        } else if (inst.name === 'HiHat' || inst.name === 'Open') {
            velocity *= isQuarter ? 1.1 : 0.85;
            if (groove.genreFeel !== 'Jazz' && playback.bpm > 165) {
                velocity *= 0.7;
                if (!isQuarter) {
                    velocity *= 0.6;
                }
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}

import { calculateTimingOffset } from '../utils.js';

/**
 * Calculates the micro-timing offset (pocket) for the drum kit.
 * @param {Object} playback - Global context.
 * @param {Object} groove - Groove state.
 * @returns {number} Offset in seconds.
 */
export function calculatePocketOffset(playback, groove) {
    let pocketOffset = calculateTimingOffset('drums', groove.pocket, playback.bandIntensity);

    // Genre-specific "Dilla" feel (Layered on top of holistic pocket)
    if (groove.genreFeel === 'Neo-Soul' || groove.genreFeel === 'Hip Hop') {
        pocketOffset += 0.015;
    }

    return pocketOffset;
}

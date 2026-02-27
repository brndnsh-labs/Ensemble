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
        const barIndex = Math.floor(step / 16);
        const activeMotif = getDrumMotif(barIndex, 'Neo-Soul', groove.creativity, drumComplexity);

        // Universal "Drunken" displacement
        const drunkenFactor = playback.bandIntensity * 0.012;
        if (loopStep % 4 !== 0) {
            instTimeOffset += (Math.random() - 0.5) * drunkenFactor;
        }

        if (inst.name === 'HiHat' || inst.name === 'Open') {
            if (shouldPlay) {
                // Straighter hats vs dragging snare/kick
                instTimeOffset -= 0.008;
                if (loopStep % 2 === 1) {
                    velocity *= 0.75; // subtle shuffle
                }
            }
        } else if (inst.name === 'Snare') {
            shouldPlay = false;
            instTimeOffset += 0.008; // Laid back feel

            if (activeMotif === 1 || activeMotif === 3) {
                // Ghost note heavy
                if (loopStep === 4 || loopStep === 12) {
                    shouldPlay = true;
                    velocity = 1.1;
                } else if ([3, 7, 11, 15].includes(loopStep)) {
                    shouldPlay = true;
                    velocity = 0.2 + Math.random() * 0.1;
                }
            } else {
                // Standard Boom Bap backbeat
                if (loopStep === 4 || loopStep === 12) {
                    shouldPlay = true;
                }
            }

            if (shouldPlay && playback.bandIntensity < 0.35) {
                soundName = 'Sidestick';
            }
        } else if (inst.name === 'Kick') {
            shouldPlay = false;
            instTimeOffset += 0.005;

            if (activeMotif === 0) {
                // Boom Bap: 1, & of 3
                if (loopStep === 0 || loopStep === 10) {
                    shouldPlay = true;
                }
            } else if (activeMotif === 2) {
                // Dilla Skips: 1, pickup to 3, pickup to 1
                if ([0, 7, 10, 15].includes(loopStep)) {
                    shouldPlay = true;
                }
            } else {
                if (loopStep === 0 || loopStep === 8) {
                    shouldPlay = true;
                }
            }

            if (shouldPlay) {
                velocity = 1.1;
            }
        }
    }

    // --- Acoustic / Percussive Overrides ---
    if (groove.genreFeel === 'Acoustic' && !inst.muted) {
        const barIndex = Math.floor(step / 16);
        const activeMotif = getDrumMotif(barIndex, 'Acoustic', groove.creativity, drumComplexity);

        if (inst.name === 'Snare') {
            shouldPlay = false;
            if (activeMotif === 2) {
                // Cajon Feel: Slap on 2 and 4
                if (loopStep === 4 || loopStep === 12) {
                    shouldPlay = true;
                }
            } else {
                // Folk: Tap on 3
                if (loopStep === 8) {
                    shouldPlay = true;
                }
            }
            // Intensity mapping
            soundName = playback.bandIntensity > 0.65 ? 'Snare' : 'Sidestick';
            if (shouldPlay) {
                velocity = 0.8 + Math.random() * 0.2;
            }
        } else if (inst.name === 'Kick') {
            shouldPlay = false;
            if (loopStep === 0) {
                shouldPlay = true;
            }
            if (activeMotif === 0 && loopStep === 6) {
                shouldPlay = true; // & of 2
            }
            if (activeMotif === 2 && loopStep === 8) {
                shouldPlay = true; // beat 3
            }
            if (shouldPlay) {
                velocity = 0.9;
            }
        } else if (inst.name === 'HiHat') {
            // Shaker feel
            shouldPlay = true;
            velocity = loopStep % 2 === 0 ? 0.7 : 0.4;
            if (activeMotif === 1) {
                velocity *= 1.2; // louder shakers
            }
        }
    }

    // --- Funk Procedural Overrides ---
    if (groove.genreFeel === 'Funk' && !inst.muted) {
        const barIndex = Math.floor(step / 16);
        const activeMotif = getDrumMotif(barIndex, 'Funk', groove.creativity, drumComplexity);
        const isTurnaround = groove.creativity && barIndex % 4 === 3;

        // "The One" reinforcement (Universal)
        if (inst.name === 'Kick' && loopStep === 0 && playback.bandIntensity > 0.8) {
            shouldPlay = true;
            velocity = 1.3;
        }

        if (inst.name === 'HiHat' || inst.name === 'Open') {
            if (isTurnaround && loopStep === 14) {
                // Turnaround: Open hi-hat bark leading to Beat 1
                shouldPlay = true;
                soundName = 'Open';
                velocity = 1.15;
            } else if (shouldPlay) {
                // Standard hi-hat dynamic shaping
                if (loopStep % 4 === 0) {
                    velocity *= 1.1; // downbeats slightly stronger
                } else if (loopStep % 2 === 1) {
                    velocity *= 0.8; // 16ths softer
                }

                // Occasional open barks if busy
                if (activeMotif === 3 && [6, 10].includes(loopStep) && Math.random() < 0.3) {
                    soundName = 'Open';
                    velocity *= 1.1;
                }
            }
        } else if (inst.name === 'Snare') {
            shouldPlay = false;

            if (activeMotif === 0) {
                // Motif 0: Standard Syncopated Funk
                if (loopStep === 4 || loopStep === 12) {
                    shouldPlay = true; // Backbeats
                }
                if (stepVal === 0 && loopStep === 7) {
                    // "a" of 2 ghost
                    shouldPlay = true;
                    velocity = 0.12;
                }
            } else if (activeMotif === 1) {
                // Motif 1: The Funky Drummer (Ghost Note Heavy)
                if (loopStep === 4 || loopStep === 12) {
                    shouldPlay = true; // Backbeats
                } else if ([3, 7, 10, 11].includes(loopStep)) {
                    // Classic ghost note placements
                    shouldPlay = true;
                    velocity = 0.06 + Math.random() * 0.1;
                }
            } else if (activeMotif === 2) {
                // Motif 2: Displaced Backbeats ("Cold Sweat")
                if (loopStep === 4) {
                    shouldPlay = true; // Beat 2 backbeat
                }
                // Displace beat 4 to the "and" of 4
                if (loopStep === 14) {
                    shouldPlay = true;
                    velocity = 1.1;
                }
                // Ghost notes
                if ([7, 9].includes(loopStep)) {
                    shouldPlay = true;
                    velocity = 0.1;
                }
            } else if (activeMotif === 3) {
                // Motif 3: Busy Linear (Garibaldi style)
                if (loopStep === 4 || loopStep === 12) {
                    shouldPlay = true;
                    velocity = 1.15; // Popping accents
                } else if ([2, 5, 9, 14].includes(loopStep)) {
                    // Highly syncopated inner ghosts
                    shouldPlay = true;
                    velocity = 0.1;
                }
            }

            if (shouldPlay) {
                if (loopStep === 4 || loopStep === 12 || loopStep === 14) {
                    velocity = Math.max(velocity, 1.1); // Ensure strong backbeats/accents
                }
                if (playback.bandIntensity < 0.4 && velocity > 0.8) {
                    soundName = 'Sidestick'; // Lower intensity
                }
            }
        } else if (inst.name === 'Kick') {
            shouldPlay = false;

            if (activeMotif === 0) {
                if (loopStep === 0 || loopStep === 8) {
                    shouldPlay = true;
                }
                if (loopStep === 10 && drumComplexity > 0.5) {
                    shouldPlay = true; // "and" of 3
                }
            } else if (activeMotif === 1) {
                // Funky Drummer kick pattern
                if (loopStep === 0 || loopStep === 6 || loopStep === 10) {
                    shouldPlay = true;
                }
                if (loopStep === 13 && Math.random() < 0.5) {
                    shouldPlay = true; // "e" of 4 pickup
                }
            } else if (activeMotif === 2) {
                // Cold Sweat kick pattern
                if (loopStep === 0 || loopStep === 8 || loopStep === 11) {
                    shouldPlay = true; // "a" of 3
                }
            } else if (activeMotif === 3) {
                // Busy Linear kick pattern
                if (loopStep === 0 || loopStep === 3 || loopStep === 7 || loopStep === 10) {
                    shouldPlay = true;
                }
            }

            if (shouldPlay) {
                velocity = 1.1 + Math.random() * 0.1;
            }
        }
    }

    // --- Disco Procedural Overrides ---
    if (groove.genreFeel === 'Disco' && !inst.muted) {
        const barIndex = Math.floor(step / 16);
        const activeMotif = getDrumMotif(barIndex, 'Disco', groove.creativity, drumComplexity);
        const isTurnaround = groove.creativity && barIndex % 4 === 3;

        if (inst.name === 'Kick') {
            // Universal Four-on-the-floor
            shouldPlay = loopStep % 4 === 0;
            if (shouldPlay) {
                velocity = loopStep === 0 ? 1.2 : 1.1;
            }
        } else if (inst.name === 'Snare') {
            shouldPlay = false;
            if (isTurnaround && loopStep > 12) {
                // Snares fills leading to the One
                shouldPlay = true;
                velocity = 0.4 + Math.random() * 0.4;
            } else {
                // Backbeat on 2 and 4
                if (loopStep === 4 || loopStep === 12) {
                    shouldPlay = true;
                    velocity = 1.15;
                }
            }
        } else if (inst.name === 'HiHat' || inst.name === 'Open') {
            shouldPlay = false;

            if (activeMotif === 0) {
                // Standard Offbeat Hats
                if (loopStep % 4 === 2) {
                    shouldPlay = true;
                    soundName = 'Open';
                    velocity = 1.1;
                }
            } else if (activeMotif === 1) {
                // Straight 8th Hats
                if (loopStep % 2 === 0) {
                    shouldPlay = true;
                    soundName = 'HiHat';
                    velocity = 0.9;
                }
                // Open on last offbeat
                if (loopStep === 14) {
                    shouldPlay = true;
                    soundName = 'Open';
                    velocity = 1.1;
                }
            } else if (activeMotif === 2) {
                // 16th note syncopation
                if (loopStep % 4 === 2) {
                    shouldPlay = true;
                    soundName = 'Open';
                } else if (loopStep % 2 === 1) {
                    shouldPlay = true;
                    soundName = 'HiHat';
                    velocity = 0.6;
                }
            }
        } else if (inst.name === 'Perc' || inst.name.includes('Cowbell')) {
            // Disco cowbell on 4ths or syncopated
            if (activeMotif === 3) {
                if (loopStep % 4 === 0) {
                    shouldPlay = true;
                    velocity = 0.8;
                }
            }
        }
    }

    // --- Reggae Procedural Overrides ---
    if (groove.genreFeel === 'Reggae' && !inst.muted) {
        const barIndex = Math.floor(step / 16);
        const activeMotif = getDrumMotif(barIndex, 'Reggae', groove.creativity, drumComplexity);

        if (inst.name === 'Kick') {
            shouldPlay = false;
            if (activeMotif === 0) {
                // One Drop: Kick only on 3
                if (loopStep === 8) {
                    shouldPlay = true;
                }
            } else if (activeMotif === 1) {
                // Steppers: Kick on every beat
                if (loopStep % 4 === 0) {
                    shouldPlay = true;
                }
            } else if (activeMotif === 2) {
                // Rockers: 1, & of 2, 3, & of 4
                if ([0, 6, 8, 14].includes(loopStep)) {
                    shouldPlay = true;
                }
            } else {
                if (loopStep === 8) {
                    shouldPlay = true;
                }
            }
            if (shouldPlay) {
                velocity = 1.15;
            }
        } else if (inst.name === 'Snare') {
            shouldPlay = false;
            // Reggae snare usually on 3 (synchronized with kick in one drop)
            if (loopStep === 8) {
                shouldPlay = true;
                velocity = 1.2;
            }
            // Add occasional ghosting/fills
            if (activeMotif === 3 && [0, 4, 12, 15].includes(loopStep) && Math.random() < 0.3) {
                shouldPlay = true;
                velocity = 0.4;
            }
            if (shouldPlay) {
                soundName = 'Sidestick'; // standard reggae rimshot
            }
        } else if (inst.name === 'HiHat' || inst.name === 'Open') {
            // Steady 8ths or 16ths
            shouldPlay = loopStep % 2 === 0;
            if (shouldPlay) {
                velocity = loopStep % 4 === 0 ? 0.9 : 0.7;
            }
        }
    }

    // --- Jazz Procedural Overrides ---
    if (groove.genreFeel === 'Jazz' && !inst.muted) {
        const isSoloistBusy = soloist.enabled && soloist.busySteps > 0;
        const barIndex = Math.floor(step / 16);
        const activeMotif = getDrumMotif(barIndex, 'Jazz', groove.creativity, drumComplexity);
        const isTurnaround = groove.creativity && barIndex % 4 === 3;

        if (inst.name === 'Open') {
            shouldPlay = false;
            // Standard Ride Pattern: 1, 2, 2-a, 3, 4, 4-a
            const rideSteps = [0, 4, 6, 8, 12, 14];

            if (isTurnaround && loopStep > 7) {
                // Turnaround: Drop the ride on beat 3 and 4 to let the snare fill breathe
            } else if (rideSteps.includes(loopStep)) {
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

            // Motif specific Ride accents (syncing cymbal crashes/bells with snare/kick comps)
            if (activeMotif === 1 && loopStep === 6) {
                velocity *= 1.2; // Charleston accent (& of 2)
            }
            if (activeMotif === 2 && loopStep === 8) {
                velocity *= 1.2; // Rev Charleston accent (Beat 3)
            }
            if (activeMotif === 3 && loopStep === 14) {
                velocity *= 1.2; // & of 4 Push
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

            // 2. Motif Based Interaction & Bombs
            const barSeed = ((barIndex * 137) % 256) / 256;
            if (isTurnaround && loopStep === 12) {
                shouldPlay = true; // Setup bomb for the turnaround
                velocity = 0.9;
            } else if (activeMotif === 1 && loopStep === 6 && barSeed > 0.5) {
                // Charleston: Kick occasionally answers the snare on the & of 2
                shouldPlay = true;
                velocity = 0.7 + playback.bandIntensity * 0.2;
            } else if (activeMotif === 4 && [10, 14].includes(loopStep)) {
                // Elvin Jones style: Kick dropping triplet polyrhythms
                shouldPlay = true;
                velocity = 0.8 + Math.random() * 0.2;
            } else if (activeMotif === 0) {
                // Standard random bombs if no strong motif
                let bombProb = playback.bandIntensity * 0.15;
                if (isSoloistBusy) {
                    bombProb *= 1.5;
                }
                if (playback.bpm > 170) {
                    bombProb *= 0.4;
                }

                if (Math.random() < bombProb && [6, 14, 15].includes(loopStep)) {
                    shouldPlay = true;
                    velocity = 0.8 + Math.random() * 0.3;
                }
            }
        } else if (inst.name === 'Snare') {
            shouldPlay = false;

            // 1. Motif Comping
            if (isTurnaround) {
                // Syncopated phrase-ending fill figures
                if ([8, 10, 11, 14].includes(loopStep)) {
                    if (Math.random() < 0.7) {
                        shouldPlay = true;
                        velocity = 0.6 + Math.random() * 0.4;
                        if (loopStep === 14) {
                            velocity = 1.1; // Strong finish
                        }
                    }
                }
            } else {
                if (activeMotif === 1) {
                    // Charleston: strong hit on & of 2
                    if (loopStep === 6) {
                        shouldPlay = true;
                        velocity = 0.7 + playback.bandIntensity * 0.3;
                    }
                } else if (activeMotif === 2) {
                    // Reverse Charleston: hits on & of 1 and Beat 3
                    if (loopStep === 2 || loopStep === 8) {
                        shouldPlay = true;
                        velocity = 0.6 + playback.bandIntensity * 0.3;
                    }
                } else if (activeMotif === 3) {
                    // "And of 4" Push
                    if (loopStep === 14) {
                        shouldPlay = true;
                        velocity = 0.8 + playback.bandIntensity * 0.3;
                    }
                } else if (activeMotif === 4) {
                    // Elvin style: dense triplet inner-rhythms
                    if ([3, 7, 11].includes(loopStep)) {
                        shouldPlay = true;
                        velocity = 0.5 + Math.random() * 0.3;
                    }
                } else {
                    // Motif 0 (Standard Conversational Comping)
                    let compProb = 0.1 + drumComplexity * 0.3;
                    if (!isSoloistBusy) {
                        compProb += 0.2;
                    }
                    if (playback.bpm > 175) {
                        compProb *= 0.5;
                    }

                    if (loopStep === 14 && Math.random() < 0.5 + compProb) {
                        shouldPlay = true;
                    } else if (loopStep === 6 && Math.random() < 0.3 + compProb) {
                        shouldPlay = true;
                    } else if ([3, 11, 15].includes(loopStep) && Math.random() < compProb * 0.4) {
                        shouldPlay = true;
                    }

                    if (shouldPlay) {
                        velocity = 0.4 + playback.bandIntensity * 0.6;
                    }
                }
            }

            if (shouldPlay) {
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
        const barIndex = Math.floor(step / 16);
        const activeMotif = getDrumMotif(barIndex, 'Blues', groove.creativity, drumComplexity);

        if (inst.name === 'HiHat' || inst.name === 'Open') {
            shouldPlay = false;
            if (activeMotif === 0 || activeMotif === 2) {
                // Shuffle steps: 0, 6, 8, 14
                if ([0, 6, 8, 14].includes(loopStep)) {
                    shouldPlay = true;
                    // Motif 2 is slow 12/8, so we might want to prioritize Open (Ride)
                    soundName = activeMotif === 2 ? 'Open' : 'HiHat';
                    velocity = loopStep === 0 || loopStep === 8 ? 1.1 : 0.8;
                }
            } else if (activeMotif === 1) {
                // Straight 8ths: 0, 2, 4, 6, 8, 10, 12, 14
                if (loopStep % 2 === 0) {
                    shouldPlay = true;
                    velocity = 0.9;
                }
            }
        } else if (inst.name === 'Kick') {
            shouldPlay = false;
            // Root on 1 and 3
            if (loopStep === 0 || loopStep === 8) {
                shouldPlay = true;
            }

            if (activeMotif === 3 && loopStep === 6) {
                shouldPlay = true; // Syncopated kick on & of 2
            }

            if (shouldPlay) {
                velocity = 1.15;
            }
        } else if (inst.name === 'Snare') {
            shouldPlay = false;
            // Backbeat on 2 and 4
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
                velocity = 1.15;
            }
            // Dragging ghost notes for shuffle
            if (activeMotif === 0 && [3, 11].includes(loopStep) && Math.random() < 0.4) {
                shouldPlay = true;
                velocity = 0.3;
                instTimeOffset += 0.005;
            }

            // Motif 3: Busy/Syncopated
            if (activeMotif === 3) {
                if (loopStep === 14 && Math.random() < 0.6) {
                    shouldPlay = true;
                    velocity = 0.7; // Strong pickup to the next bar
                }
                if (loopStep === 10 && Math.random() < 0.3) {
                    shouldPlay = true;
                    velocity = 0.4; // Light ghost note on "and" of 3
                }
            }
        }
    }

    // --- Rock Procedural Overrides ---
    if (groove.genreFeel === 'Rock' && !inst.muted) {
        const barIndex = Math.floor(step / 16);
        const activeMotif = getDrumMotif(barIndex, 'Rock', groove.creativity, drumComplexity);
        const isTurnaround = groove.creativity && barIndex % 4 === 3;

        if (inst.name === 'HiHat' || inst.name === 'Open') {
            if (isTurnaround && loopStep > 7) {
                shouldPlay = false; // Drop hi-hat for the fill
            } else {
                // Explicit Rock Pulse (Eighth notes)
                if (loopStep % 2 === 0) {
                    shouldPlay = true;
                    velocity = loopStep % 4 === 0 ? 1.05 : 0.85;

                    if (playback.bandIntensity > 0.7) {
                        soundName = 'Open';
                        velocity *= 1.1;
                    } else {
                        soundName = 'HiHat'; // Force closed at low intensity
                    }
                }
            }
        } else if (inst.name === 'Kick') {
            shouldPlay = false;
            // Always ground the 1 and 3 in Rock
            if (loopStep === 0 || loopStep === 8) {
                shouldPlay = true;
            } else if (activeMotif === 1) {
                // Syncopated Kick
                if (loopStep === 6 || loopStep === 10) {
                    shouldPlay = true;
                }
            } else if (activeMotif === 2) {
                // The "Push"
                if (loopStep === 10) {
                    shouldPlay = true;
                }
            } else if (activeMotif === 3) {
                // Heavy Syncopation
                if (loopStep === 6 || loopStep === 10 || loopStep === 14) {
                    shouldPlay = true;
                }
            }

            if (shouldPlay) {
                velocity = isDownbeat ? 1.25 : 1.1;
            }
        } else if (inst.name === 'Snare') {
            shouldPlay = false;

            // Always preserve backbeat even during turnaround fills
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
            }

            if (isTurnaround && loopStep > 7) {
                // Turnaround Fill (Extra notes)
                if ([8, 10, 14].includes(loopStep) && Math.random() < 0.4) {
                    shouldPlay = true;
                    velocity = 0.8 + Math.random() * 0.2;
                }
            } else {
                // Ghosting
                if (!shouldPlay && (loopStep === 7 || loopStep === 9)) {
                    if (
                        playback.bandIntensity > 0.4 &&
                        playback.bandIntensity < 0.75 &&
                        Math.random() < 0.08
                    ) {
                        shouldPlay = true;
                        velocity = 0.25;
                    }
                }
            }

            if (shouldPlay) {
                if (loopStep === 4 || loopStep === 12) {
                    velocity = 1.15;
                }
                if (playback.bandIntensity < 0.25) {
                    soundName = 'Sidestick';
                }
            }
        } else if (inst.name.includes('Tom')) {
            if (isTurnaround && loopStep > 7) {
                if ([8, 10, 12, 14].includes(loopStep) && Math.random() < 0.6) {
                    shouldPlay = true;
                    velocity = 1.1;
                }
            }
        }
    }

    // --- Latin / World Procedural Overrides ---
    const isLatinStyle =
        groove.genreFeel === 'Bossa Nova' ||
        ['Bossa Nova', 'Latin/Salsa', 'Afro-Cuban 6/8', 'Samba'].includes(groove.lastDrumPreset) ||
        groove.lastSmartGenre === 'Bossa';

    if (isLatinStyle && !inst.muted) {
        const barIndex = Math.floor(step / 16);
        const activeMotif = getDrumMotif(barIndex, 'Bossa Nova', groove.creativity, drumComplexity);
        const isTurnaround = groove.creativity && barIndex % 4 === 3;

        if (inst.name === 'Kick') {
            shouldPlay = false;
            // Surdo "Heartbeat" (0, 3, 8, 11)
            if ([0, 3, 8, 11].includes(loopStep)) {
                shouldPlay = true;
                velocity = loopStep === 0 || loopStep === 8 ? 1.1 : 0.85; // Stronger on the 1 and 3
            }
            if (activeMotif === 2) {
                // Samba Driving Feel (Pickup 16ths)
                if ([7, 15].includes(loopStep)) {
                    shouldPlay = true;
                }
            }
        } else if (inst.name === 'Snare') {
            shouldPlay = false;
            soundName = 'Sidestick';

            if (activeMotif === 0) {
                // 3-2 Bossa Clave: 0, 3, 6, 10, 13
                if ([0, 3, 6, 10, 13].includes(loopStep)) {
                    shouldPlay = true;
                }
            } else if (activeMotif === 1) {
                // 2-3 Bossa Clave: 2, 5, 8, 11, 14
                if ([2, 5, 8, 11, 14].includes(loopStep)) {
                    shouldPlay = true;
                }
            } else if (activeMotif === 2) {
                // Partido Alto: 0, 4, 7, 8, 11, 13, 15
                if ([0, 4, 7, 8, 11, 13, 15].includes(loopStep)) {
                    shouldPlay = true;
                }
            } else if (activeMotif === 3) {
                // 3-2 Son Clave: 0, 3, 6, 10, 12
                if ([0, 3, 6, 10, 12].includes(loopStep)) {
                    shouldPlay = true;
                }
            }

            if (shouldPlay) {
                velocity = 0.9 + Math.random() * 0.2;
            }
        } else if (inst.name === 'Shaker') {
            // Constant 16ths with push/pull accents
            shouldPlay = true;
            velocity = loopStep % 2 === 0 ? 0.8 : 0.5;
            if (loopStep % 4 === 0) {
                velocity *= 1.1; // downbeat accent
            }
        } else if (inst.name === 'Conga') {
            // Tumbao Pattern: 4, 11, 12, 15
            const tumbaoSteps = [4, 11, 12, 15];
            if (tumbaoSteps.includes(loopStep)) {
                shouldPlay = true;
                if (loopStep === 12) {
                    soundName = 'CongaHighSlap';
                } else if (loopStep === 15) {
                    soundName = 'CongaHigh';
                } else {
                    soundName = 'CongaHighMute';
                }
                velocity = 0.7;
            }
        } else if (inst.name === 'Guiro' && isTurnaround) {
            // Percussion fill on turnaround
            if (loopStep > 8) {
                shouldPlay = true;
                velocity = 0.6;
            }
        }
    }

    // --- GENRE-AUTHENTIC ENTROPY (Creativity Mode) ---
    const entropyMultiplier = ['Blues', 'Rock', 'Disco', 'Acoustic'].includes(groove.genreFeel)
        ? 0.08
        : 0.15;

    if (
        groove.creativity &&
        !inst.muted &&
        !shouldPlay &&
        Math.random() < playback.bandIntensity * entropyMultiplier
    ) {
        // Only add entropy on non-primary steps to avoid clashing with the "core" of the genre
        const isSyncopated = loopStep % 2 === 1;
        const isHeavySync = loopStep % 4 === 2;

        // Block snare hits on steps immediately after the backbeat (5 and 13) for certain genres
        // to maintain a strong, authoritative pulse.
        const isBackbeatAdjacent = [5, 13].includes(loopStep);
        const blockAdjacentSnare =
            ['Blues', 'Rock', 'Disco', 'Acoustic'].includes(groove.genreFeel) && isBackbeatAdjacent;

        const isLatin =
            groove.genreFeel === 'Bossa Nova' ||
            groove.genreFeel === 'Latin' ||
            ['Bossa Nova', 'Latin/Salsa', 'Afro-Cuban 6/8', 'Samba'].includes(
                groove.lastDrumPreset,
            );

        if (inst.name === 'Snare' && isSyncopated && !blockAdjacentSnare && !isLatin) {
            shouldPlay = true;
            velocity = 0.1 + Math.random() * 0.15;
            soundName = playback.bandIntensity < 0.4 ? 'Sidestick' : 'Snare';
        } else if (
            (inst.name === 'HiHat' || inst.name === 'Open') &&
            isHeavySync &&
            !['Blues', 'Rock', 'Disco', 'Acoustic'].includes(groove.genreFeel)
        ) {
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
            } else if (stepVal !== 2 && soundName !== 'Open') {
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

        if (groove.genreFeel === 'Funk' && stepVal === 2) {
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
    }

    // --- Ska-Punk Procedural Overrides ---
    if (groove.genreFeel === 'Ska-Punk' && !inst.muted) {
        const barIndex = Math.floor(step / 16);
        const activeMotif = getDrumMotif(barIndex, 'Ska-Punk', groove.creativity, drumComplexity);
        const isTurnaround = groove.creativity && barIndex % 4 === 3;

        instTimeOffset -= 0.005; // Fast energetic push

        if (inst.name === 'HiHat' || inst.name === 'Open') {
            shouldPlay = false;
            // Upbeat focus
            if (loopStep % 4 === 2) {
                shouldPlay = true;
                velocity = 1.35; // Loud offbeats
                if (playback.bandIntensity > 0.6 && Math.random() < 0.3) {
                    soundName = 'Open';
                }
            } else if (activeMotif === 1 && loopStep % 2 === 0) {
                // Double-time punk hats on 8ths
                shouldPlay = true;
                velocity = 0.85;
            }
        } else if (inst.name === 'Kick') {
            shouldPlay = false;
            if (activeMotif === 1) {
                // Double-time: Kick on 1, 2, 3, 4
                if (loopStep % 4 === 0) {
                    shouldPlay = true;
                }
            } else {
                // Standard driving: 1, & of 2, 3
                if ([0, 6, 8].includes(loopStep)) {
                    shouldPlay = true;
                }
            }
            if (shouldPlay) {
                velocity = 1.2;
            }
        } else if (inst.name === 'Snare') {
            shouldPlay = false;
            if (isTurnaround && loopStep > 12) {
                shouldPlay = true;
                velocity = 1.1; // Turnaround roll
            } else {
                if (loopStep === 4 || loopStep === 12) {
                    shouldPlay = true;
                    velocity = 1.15;
                }
            }
        }
    }

    if (shouldPlay && !inst.muted) {
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
            if (groove.genreFeel === 'Ska-Punk') {
                // Ska-Punk has its own velocity logic for offbeat emphasis
            } else {
                velocity *= isQuarter ? 1.1 : 0.85;
                if (groove.genreFeel !== 'Jazz' && playback.bpm > 165) {
                    velocity *= 0.7;
                    if (!isQuarter) {
                        velocity *= 0.6;
                    }
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

/**
 * Generates a deterministic motif ID for the current measure based on genre and complexity.
 * This ensures drum comping and accents are structurally sound rather than completely random per step.
 * Extensible for future genres.
 *
 * @param {number} barIndex - The current measure index (e.g. Math.floor(step / 16))
 * @param {string} genreFeel - The active genre feel (e.g. 'Jazz', 'Funk')
 * @param {boolean} creativity - Whether creativity mode is enabled
 * @param {number} complexity - The drum complexity scalar (0.0 to 1.0)
 * @returns {number} Motif ID (meaning depends on genre logic)
 */
export function getDrumMotif(barIndex, genreFeel, creativity, complexity) {
    // Pseudo-random 0-1 value based on the measure index. Stable throughout the measure.
    const seed = ((barIndex * 137 + (creativity ? 42 : 0)) % 256) / 256;

    if (genreFeel === 'Jazz') {
        // Motif Map:
        // 0: Standard Conversational Comping
        // 1: Charleston (Beat 1, & of 2)
        // 2: Reverse Charleston (& of 1, Beat 3)
        // 3: The "& of 4" Push
        // 4: Elvin Interaction (Dense Triplet Drops)

        // Low complexity defaults to standard light comping
        if (complexity < 0.3) {
            return 0;
        }

        if (seed < 0.25) {
            return 1;
        }
        if (seed < 0.5) {
            return 2;
        }
        if (seed < 0.75) {
            return 3;
        }

        // Reserve Motif 4 for high-creativity polyrhythmic scenarios
        if (creativity && seed > 0.85) {
            return 4;
        }

        return 0;
    }

    if (genreFeel === 'Rock') {
        // Motif Map:
        // 0: Standard Money Beat
        // 1: Syncopated Kick (Beat 1, & of 2, & of 3)
        // 2: The "Push" (Kick on 1, & of 3)
        // 3: Heavy Syncopation / Ghosting

        if (complexity < 0.3) {
            return 0;
        }

        if (seed < 0.33) {
            return 1;
        }
        if (seed < 0.66) {
            return 2;
        }
        return 3;
    }

    if (genreFeel === 'Funk') {
        // Motif Map:
        // 0: Standard Syncopated Funk
        // 1: The Funky Drummer (Ghost Note heavy)
        // 2: Displaced Backbeats ("Cold Sweat")
        // 3: Busy Linear (Garibaldi)

        if (complexity < 0.3) {
            return 0;
        }

        if (seed < 0.25) {
            return 1;
        }
        if (seed < 0.5) {
            return 2;
        }
        if (seed < 0.75) {
            return 3;
        }

        return 0; // standard fallback
    }

    if (genreFeel === 'Bossa Nova' || genreFeel === 'Latin') {
        // Motif Map:
        // 0: 3-2 Bossa Clave
        // 1: 2-3 Bossa Clave
        // 2: Partido Alto (Samba)
        // 3: 3-2 Son Clave (Salsa)

        if (complexity < 0.3) {
            return 0;
        }

        if (seed < 0.25) {
            return 0;
        }
        if (seed < 0.5) {
            return 1;
        }
        if (seed < 0.75) {
            return 2;
        }
        return 3;
    }

    if (genreFeel === 'Disco') {
        // Motif Map:
        // 0: Standard Offbeat Hats
        // 1: Straight 8th Hats
        // 2: 16th note Syncopation
        // 3: Percussion/Cowbell Heavy

        if (complexity < 0.3) {
            return 0;
        }

        if (seed < 0.4) {
            return 0;
        }
        if (seed < 0.7) {
            return 1;
        }
        if (seed < 0.9) {
            return 2;
        }
        return 3;
    }

    if (genreFeel === 'Neo-Soul' || genreFeel === 'Hip Hop') {
        // Motif Map:
        // 0: Standard Boom Bap
        // 1: Ghost Note Heavy
        // 2: Syncopated Kick (Dilla)
        // 3: Percussion/Sidestick

        if (complexity < 0.3) {
            return 0;
        }

        if (seed < 0.3) {
            return 0;
        }
        if (seed < 0.6) {
            return 1;
        }
        if (seed < 0.8) {
            return 2;
        }
        return 3;
    }

    if (genreFeel === 'Reggae') {
        // Motif Map:
        // 0: One Drop
        // 1: Steppers
        // 2: Rockers
        // 3: Dub / Syncopated

        if (complexity < 0.3) {
            return 0;
        }

        if (seed < 0.85) {
            return 0; // One Drop (Dominant)
        }
        if (seed < 0.92) {
            return 1; // Steppers
        }
        if (seed < 0.97) {
            return 2; // Rockers
        }
        return 3; // Dub / Syncopated
    }

    if (genreFeel === 'Blues') {
        // Motif Map:
        // 0: Standard Shuffle
        // 1: Straight 8ths
        // 2: Slow 12/8
        // 3: Busy/Syncopated

        if (complexity < 0.3) {
            return 0;
        }

        if (seed < 0.6) {
            return 0; // Standard Shuffle (More common)
        }
        if (seed < 0.85) {
            return 2; // Slow 12/8
        }
        if (creativity && seed > 0.95) {
            return 1; // Rare Straight 8ths
        }
        return 3; // Busy/Syncopated
    }

    if (genreFeel === 'Ska-Punk') {
        // Motif Map:
        // 0: Standard Ska-Punk (Offbeat emphasis)
        // 1: Double-time Punk
        // 2: Syncopated Ska
        // 3: Busy / Fill Heavy

        if (complexity < 0.3) {
            return 0;
        }

        if (seed < 0.4) {
            return 0;
        }
        if (seed < 0.7) {
            return 1;
        }
        if (seed < 0.9) {
            return 2;
        }
        return 3;
    }

    if (genreFeel === 'Acoustic') {
        // Motif Map:
        // 0: Standard Folk
        // 1: Shaker Heavy
        // 2: Cajon Feel
        // 3: Busy Percussive

        if (complexity < 0.3) {
            return 0;
        }

        if (seed < 0.4) {
            return 0;
        }
        if (seed < 0.7) {
            return 1;
        }
        if (seed < 0.9) {
            return 2;
        }
        return 3;
    }

    // Default fallback for unmapped genres
    return 0;
}

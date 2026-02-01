/**
 * Applies procedural groove logic based on the active genre and band intensity.
 * @param {Object} params - The current step parameters.
 * @returns {Object} { shouldPlay, velocity, soundName, instTimeOffset }
 */
export function applyGrooveOverrides({ step, inst, stepVal, playback, groove, isDownbeat, isQuarter, isBackbeat, isGroupStart }) {
    let instTimeOffset = 0;
    let velocity = stepVal === 2 ? 1.25 : 0.9;
    let shouldPlay = stepVal > 0;
    let soundName = inst.name;
    const loopStep = step % 16;

    // --- Neo-Soul "Dilla" Quantization Mismatch ---
    if (groove.genreFeel === 'Neo-Soul' || groove.genreFeel === 'Hip Hop') {
        // Hats push forward (straighter), Snare drags back (lazier)
        if (inst.name === 'HiHat' || inst.name === 'Open') instTimeOffset -= 0.012; 
        if (inst.name === 'Snare') instTimeOffset += 0.008;
    }

    // --- Neo-Soul / Hip Hop Procedural Overrides ---
    if ((groove.genreFeel === 'Neo-Soul' || groove.genreFeel === 'Hip Hop') && !inst.muted) {
        // 1. "Drunken" Pocket (Varying displacement based on intensity) - TIGHTENED
        const drunkenFactor = playback.bandIntensity * 0.012; 
        if (loopStep % 4 !== 0) instTimeOffset += (Math.random() - 0.5) * drunkenFactor;

        // 2. Ghost Note "Peeling" (Density increases with intensity and complexity)
        if (inst.name === 'Snare' && stepVal === 0) {
            const ghostProb = 0.1 + (playback.bandIntensity * 0.3) + (playback.complexity * 0.2);
            if (Math.random() < ghostProb && [2, 3, 6, 7, 10, 11, 14, 15].includes(loopStep)) {
                shouldPlay = true;
                velocity = 0.15 + (Math.random() * 0.1);
                instTimeOffset += 0.008; // Reduced drag
            }
        }

        // 3. Lazy Snare displacement at high intensity - TIGHTENED
        if (inst.name === 'Snare' && (loopStep === 4 || loopStep === 12) && playback.bandIntensity > 0.75) {
            instTimeOffset += 0.012; // Reduced late "crack"
            velocity *= 1.1;
        }

        // 4. "Skippy" Kick Variations
        if (inst.name === 'Kick') {
            const skipProb = 0.1 + (playback.bandIntensity * 0.35);
            if ((loopStep === 3 || loopStep === 11 || loopStep === 15) && Math.random() < skipProb) {
                shouldPlay = true;
                velocity = 0.55 + (Math.random() * 0.15);
            }
        }
    }

    // --- Acoustic / Percussive Overrides ---
    if (groove.genreFeel === 'Acoustic' && !inst.muted) {
        // Simulate a Cajon or hand-percussion feel
        if (inst.name === 'Snare') {
            // High intensity = "Slap" sound (Snare), Low intensity = "Rim/Tap" (Sidestick)
            soundName = (playback.bandIntensity > 0.5) ? 'Snare' : 'Sidestick';
            
            // Add subtle mid-phrase taps as intensity builds
            if (stepVal === 0) {
                const tapProb = (playback.bandIntensity * 0.35);
                if (Math.random() < tapProb && loopStep % 2 === 1) {
                    shouldPlay = true;
                    velocity = 0.2 + (Math.random() * 0.15);
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
            if (loopStep % 2 === 1) velocity *= 0.7;
            if (playback.bandIntensity < 0.3) {
                // Very sparse hats at low intensity
                if (loopStep % 4 !== 0) shouldPlay = false;
            }
        }
    }

    // --- Funk Procedural Overrides ---
    if (groove.genreFeel === 'Funk' && !inst.muted) {
        // 1. Intelligent Snare Ghosting
        if (inst.name === 'Snare' && stepVal === 0) {
            const isSubdivision = loopStep % 4 !== 0 && loopStep % 4 !== 2; 
            if (isSubdivision) {
                const kickInst = groove.instruments.find(i => i.name === 'Kick');
                const kickPlaying = kickInst && kickInst.steps[step] > 0;

                let ghostProb = playback.complexity * 0.5;
                if (playback.bpm > 160) ghostProb *= 0.4; // Reduce clutter at high BPM

                if (!kickPlaying && Math.random() < ghostProb) {
                    shouldPlay = true;
                    velocity = 0.15 + (Math.random() * 0.1); 
                }
            }
        }
        
        // 2. Dynamic Hi-Hat Barks
        if (inst.name === 'HiHat' && shouldPlay) {
            if (loopStep % 4 === 3 && Math.random() < (playback.bandIntensity * 0.35)) {
                soundName = 'Open';
                velocity *= 1.1; 
            }
        }
    }

    // --- Disco Procedural Overrides ---
    if (groove.genreFeel === 'Disco' && !inst.muted) {
        // 1. Four-on-the-Floor Kick
        if (inst.name === 'Kick') {
            shouldPlay = (loopStep % 4 === 0);
            if (shouldPlay) velocity = (loopStep === 0) ? 1.2 : 1.1; 
        }
        
        // 2. Backbeat Snare
        if (inst.name === 'Snare') {
            shouldPlay = (loopStep === 4 || loopStep === 12);
            if (shouldPlay) velocity = 1.15;
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
                const discoCompProb = 0.4 + (playback.complexity * 0.4); // Scales from 0.4 to 0.8
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
                shouldPlay = (loopStep % 4 === 0);
                if (shouldPlay) velocity = 1.15;
            } 
            else if (playback.bandIntensity > 0.45) {
                if (loopStep === 0) { shouldPlay = true; velocity = 1.1; }
                if (loopStep === 8) { shouldPlay = true; velocity = 1.15; }
            }
        }
    }

    // --- Jazz Procedural Overrides ---
    if (groove.genreFeel === 'Jazz' && !inst.muted) {
        if (inst.name === 'Open') {
            shouldPlay = false;
            if ([0, 4, 6, 8, 12, 14].includes(loopStep)) {
                // High BPM: Flatten the swing pattern to reduce wash
                if (playback.bpm > 170 && (loopStep === 6 || loopStep === 14)) {
                     // Mute the "a" of "1, 2-a" occasionally or lower velocity
                     if (Math.random() < 0.5) shouldPlay = true;
                     else shouldPlay = false;
                } else {
                    shouldPlay = true;
                }

                if (shouldPlay) {
                    if (loopStep % 4 === 0) velocity = 1.15;
                    else velocity = 0.75;
                }
            }
        } else if (inst.name === 'HiHat') {
            shouldPlay = false;
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
                velocity = 0.8;
            }
        } else if (inst.name === 'Kick') {
            shouldPlay = false;
            if (loopStep % 4 === 0) { shouldPlay = true; velocity = 0.35; }
            let bombProb = playback.bandIntensity * 0.3;
            if (playback.bpm > 165) bombProb *= 0.5; // Fewer bombs at fast swing

            if (Math.random() < bombProb) {
                if ([10, 14, 15].includes(loopStep)) { shouldPlay = true; velocity = 0.9 + (Math.random() * 0.2); }
            }
        } else if (inst.name === 'Snare') {
            shouldPlay = false;
            let compProb = 0.08;
            if (playback.bpm > 165) compProb = 0.04;

            if (Math.random() < compProb) { shouldPlay = true; velocity = 0.25; }

            // Comping logic
            if (loopStep === 14) {
                if (Math.random() < 0.6 + (playback.bandIntensity * 0.3)) { shouldPlay = true; velocity = 0.85; }
            } else if (loopStep === 6) {
                if (Math.random() < 0.3 + (playback.bandIntensity * 0.3)) { shouldPlay = true; velocity = 0.8; }
            }

            // High BPM Comping Throttling
            if (playback.bpm > 175 && shouldPlay && velocity > 0.5 && Math.random() < 0.3) {
                 shouldPlay = false; // Thin out the comping
            }
        }
    }

    // --- Blues Procedural Overrides ---
    if (groove.genreFeel === 'Blues' && !inst.muted) {
        if (inst.name === 'HiHat') {
            shouldPlay = false;
            if (loopStep === 4 || loopStep === 12) { shouldPlay = true; velocity = 0.85; }
        } else if (inst.name === 'Open') {
            shouldPlay = false;
            if (loopStep % 4 === 0) { shouldPlay = true; velocity = 1.1; }
            else if (loopStep % 2 === 0) {
                const skipProb = 0.4 + (playback.bandIntensity * 0.5);
                if (Math.random() < skipProb) { shouldPlay = true; velocity = 0.7; }
            }
        } else if (inst.name === 'Kick') {
            if (loopStep === 0) { shouldPlay = true; velocity = 1.2; }
        } else if (inst.name === 'Snare') {
            if (loopStep === 4 || loopStep === 12) { shouldPlay = true; velocity = 1.1; }
        }
    }

    // --- Latin / World Procedural Overrides ---
    const isLatinStyle = groove.genreFeel === 'Bossa Nova' || 
                         ['Bossa Nova', 'Latin/Salsa', 'Afro-Cuban 6/8', 'Samba'].includes(groove.lastDrumPreset) || 
                         groove.lastSmartGenre === 'Bossa';

    if (isLatinStyle) {
        if (inst.name === 'Conga') {
            // Randomly switch between CongaHigh (Open), CongaSlap, and CongaMute
            const slapProb = 0.1 + (playback.bandIntensity * 0.4);
            const muteProb = 0.2;
            const rand = Math.random();
            if (rand < slapProb) soundName = 'CongaHighSlap';
            else if (rand < slapProb + muteProb) soundName = 'CongaHighMute';
            else soundName = 'CongaHigh';
            
            // Subtle ghosting
            if (stepVal === 0 && Math.random() < (playback.bandIntensity * 0.2)) {
                shouldPlay = true;
                velocity = 0.2;
                soundName = 'CongaHighMute';
            }
        }
        
        if (inst.name === 'Bongo') {
            soundName = (loopStep % 8 < 4) ? 'BongoHigh' : 'BongoLow';
            if (Math.random() < 0.2) velocity *= 0.8;
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
                velocity = (loopStep % 2 === 0) ? 0.7 : 0.4;
                velocity *= (0.8 + Math.random() * 0.4); // High humanization
            } else if (stepVal > 0) {
                // 2. Grid Overrides: Accent the "push" (8th notes) and vary the "pull" (16ths)
                if (loopStep % 2 === 1) velocity *= (0.65 + Math.random() * 0.15);
                else velocity *= 1.1;
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
            if (shouldPlay && loopStep % 4 === 2) instTimeOffset += 0.005;
        }

        if (inst.name === 'High Tom' && stepVal === 0 && groove.lastSmartGenre === 'Bossa' && playback.bandIntensity > 0.75) {
            // Add occasional Tom "surdo" style accents on beat 3/4
            if (loopStep === 10 || loopStep === 14) {
                if (Math.random() < 0.2) {
                    shouldPlay = true;
                    velocity = 0.6;
                }
            }
        }
    }

    // --- Global Timing & Gain Adjustments ---
    if (shouldPlay && !inst.muted) {
        if (groove.genreFeel === 'Funk' && (inst.name === 'HiHat' || inst.name === 'Open')) {
             if (stepVal === 2 && playback.bandIntensity > 0.6) velocity = 1.0; 
             else if (stepVal !== 2) velocity = Math.min(velocity, 0.75); 
        }
        
        if (groove.genreFeel === 'Neo-Soul' || groove.genreFeel === 'Hip Hop') velocity *= 0.75; 
        
        if (inst.name === 'Snare') {
            if (groove.lastDrumPreset === 'Bossa Nova') {
                soundName = 'Sidestick';
                const bossaStep = step % 32; 
                if (playback.bandIntensity > 0.5 && (bossaStep === 7 || bossaStep === 23) && Math.random() < 0.2) {
                    shouldPlay = true; velocity = 0.6;
                }
                if (bossaStep === 31 && Math.random() < 0.2) {
                    shouldPlay = true; velocity = 0.45;
                }
            } else if (groove.genreFeel === 'Acoustic') {
                soundName = (playback.bandIntensity > 0.7) ? 'Snare' : 'Sidestick';
            } else if (playback.bandIntensity < 0.35 && groove.genreFeel !== 'Rock') {
                soundName = 'Sidestick';
            }
        }

        if (groove.genreFeel === 'Rock') {
            if (inst.name === 'HiHat' || inst.name === 'Open') {
                if (loopStep % 4 === 0) velocity *= 1.05; 
                else if (loopStep % 4 === 2) velocity *= 0.95; 
            }
            if (inst.name === 'Kick' && loopStep === 10 && playback.bandIntensity > 0.4 && Math.random() < 0.25) {
                shouldPlay = true; velocity = 0.9; 
            }
            if (inst.name === 'Snare' && !shouldPlay && (loopStep === 7 || loopStep === 9) && playback.bandIntensity > 0.35 && playback.bandIntensity < 0.75 && Math.random() < 0.12) {
                shouldPlay = true; velocity = 0.35; 
            }

            if (playback.bandIntensity > 0.7) {
                if (inst.name === 'HiHat' && shouldPlay) { soundName = 'Open'; velocity *= 1.1; }
                if (inst.name === 'Snare' && shouldPlay) velocity *= 1.15;
                if (inst.name === 'Kick' && isDownbeat) velocity *= 1.25;
            } 
            else if (playback.bandIntensity < 0.4) {
                if (inst.name === 'Snare' && shouldPlay) {
                     velocity *= 0.85;
                     if (playback.bandIntensity < 0.25) soundName = 'Sidestick';
                }
                if (inst.name === 'HiHat') velocity *= 0.8;
                if (inst.name === 'Kick' && !isDownbeat) velocity *= 0.7;
            }
            else {
                if (inst.name === 'Kick' && isDownbeat) velocity *= 1.2;
                if (inst.name === 'Snare' && isBackbeat) velocity *= 1.2;
            }
        } else if (groove.genreFeel === 'Funk' && stepVal === 2) velocity *= 1.1;

        if (groove.genreFeel === 'Disco' && inst.name === 'Open') velocity *= 1.15; 
        
        if (inst.name === 'HiHat' && groove.genreFeel !== 'Jazz' && playback.bandIntensity > 0.8 && isQuarter) { soundName = 'Open'; velocity *= 1.1; }
        if (inst.name === 'Kick') velocity *= isDownbeat ? 1.15 : (isGroupStart ? 1.1 : (isQuarter ? 1.05 : 0.9));
        else if (inst.name === 'Snare') velocity *= isBackbeat ? 1.1 : 0.9;
        else if (inst.name === 'HiHat' || inst.name === 'Open') {
            velocity *= isQuarter ? 1.1 : 0.85;
            if (groove.genreFeel !== 'Jazz' && playback.bpm > 165) { velocity *= 0.7; if (!isQuarter) velocity *= 0.6; }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}

/**
 * Calculates the micro-timing offset (pocket) for the drum kit.
 * @param {Object} playback - Global context.
 * @param {Object} groove - Groove state.
 * @returns {number} Offset in seconds.
 */
export function calculatePocketOffset(playback, groove) {
    let pocketOffset = 0;
    // Push slightly ahead during high intensity/climaxes
    if (playback.bandIntensity > 0.75) pocketOffset -= 0.008; 
    // Lay back during low intensity/cool-downs
    else if (playback.bandIntensity < 0.3) pocketOffset += 0.010;
    
    // Genre-specific "Dilla" feel
    if (groove.genreFeel === 'Neo-Soul' || groove.genreFeel === 'Hip Hop') pocketOffset += 0.015;
    
    return pocketOffset;
}
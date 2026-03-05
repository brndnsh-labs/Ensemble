import re

with open('public/soloist.js', 'r') as f:
    content = f.read()

# 1. Update finalizeNote timingOffset
old_timing = """        const timingOffset = calculateTimingOffset(
            'soloist',
            groove.pocket,
            playback.bandIntensity || 0.5,
        );
        primary.timingOffset = (primary.timingOffset || 0) + timingOffset;"""

new_timing = """        let timingOffset = calculateTimingOffset(
            'soloist',
            groove.pocket,
            playback.bandIntensity || 0.5,
        );

        // 1. Genre Gravity
        const config = STYLE_CONFIG[activeStyle] || STYLE_CONFIG.scalar;
        timingOffset += (config.genreGravityOffset || 0);

        // 2. Rhythmic Rolling (Syncopation Lag)
        const isSyncopated = stepInBeat % (stepsPerBeat / 2) !== 0;
        if (isSyncopated) {
            timingOffset += 0.007; // 7ms lag for 'e' and 'a'
        }

        // Ghost notes drag slightly more
        if ((primary.velocity || 0.8) < 0.7) {
            timingOffset += 0.005; // 5ms drag
        }

        // 3 & 4. Style-Specific Jitter & Intensity-Driven Tightness
        if (config.timingJitter !== undefined) {
            // Scale jitter: at intensity 0.2 it's looser, at 0.9 it's tighter
            const tightness = playback.bandIntensity || 0.5;
            const jitterScale = 1.0 - tightness;
            const jitterMs = config.timingJitter * jitterScale;
            timingOffset += (Math.random() - 0.5) * (jitterMs / 1000);
        }

        primary.timingOffset = (primary.timingOffset || 0) + timingOffset;"""

content = content.replace(old_timing, new_timing)

# 2. Update velocity calculation
old_vel = """    const baseVelocity = 0.6 + intensity * 0.4;
    const isImportantStep = stepInBeat === 0 || stepInBeat === 2;
    let stepVelocity = isImportantStep ? baseVelocity * 1.15 : baseVelocity;"""

new_vel = """    const baseVelocity = 0.6 + intensity * 0.4;

    // Detect 'The One' (downbeat of measure) and Backbeats (e.g., beats 2 & 4)
    const isTheOne = measureStep === 0;
    const isBackbeat = measureStep === stepsPerBeat || measureStep === stepsPerBeat * 3;
    const isImportantStep = stepInBeat === 0 || stepInBeat === 2;

    let stepVelocity = baseVelocity;
    if (isTheOne) {
        stepVelocity = baseVelocity * 1.25; // Strongest emphasis
    } else if (isBackbeat) {
        stepVelocity = baseVelocity * 1.15; // Strong emphasis
    } else if (isImportantStep) {
        stepVelocity = baseVelocity * 1.05; // Light emphasis
    }"""

content = content.replace(old_vel, new_vel)

with open('public/soloist.js', 'w') as f:
    f.write(content)

print("Patched.")

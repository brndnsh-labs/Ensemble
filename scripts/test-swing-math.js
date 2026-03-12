const bpm = 120;
const sixteenth = 0.25 * (60.0 / bpm); // 125ms

function testSwing(swingPercent) {
    const shift = (sixteenth / 3) * (swingPercent / 100);

    // New weighted logic: [1.5, 0.5, -0.5, -1.5]
    const weights = [1.5, 0.5, -0.5, -1.5];

    const d0 = sixteenth + shift * weights[0];
    const d1 = sixteenth + shift * weights[1];
    const d2 = sixteenth + shift * weights[2];
    const d3 = sixteenth + shift * weights[3];

    const t0 = 0;
    const t1 = d0;
    const t2 = d0 + d1; // 8th note offbeat ("and")
    const t3 = d0 + d1 + d2; // 16th note offbeat ("a")
    const t4 = d0 + d1 + d2 + d3; // Next beat start

    console.log(`\n--- Swing ${swingPercent}% ---`);
    console.log(`Shift Base: ${shift.toFixed(4)}s`);
    console.log(
        `Durations: [${d0.toFixed(4)}, ${d1.toFixed(4)}, ${d2.toFixed(4)}, ${d3.toFixed(4)}]`,
    );
    console.log(`Absolute Times:`);
    console.log(`  Step 0: ${t0.toFixed(4)}s (Beat Start)`);
    console.log(`  Step 1: ${t1.toFixed(4)}s ("e")`);
    console.log(`  Step 2: ${t2.toFixed(4)}s ("and")`);
    console.log(`  Step 3: ${t3.toFixed(4)}s ("a")`);
    console.log(`  Step 4: ${t4.toFixed(4)}s (Next Beat)`);

    // Ratio of first 8th note to second 8th note
    const _eighthNoteTime = sixteenth * 2;
    const actualEighthOffbeat = t2;
    const ratio = (actualEighthOffbeat / (sixteenth * 4)) * 100;
    console.log(`8th Note Position: ${ratio.toFixed(1)}% of beat`);

    // Position of the "a" (used heavily in Blues shuffle)
    const aPosition = (t3 / (sixteenth * 4)) * 100;
    console.log(`16th "a" Position: ${aPosition.toFixed(1)}% of beat`);
}

testSwing(0);
testSwing(50);
testSwing(66);
testSwing(100);

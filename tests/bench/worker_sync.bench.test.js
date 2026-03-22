import { describe, it } from 'vitest';

describe('Worker Sync Performance', () => {
    it('measures array .find vs Map lookup in sync state', () => {
        const numInstruments = 50;
        const stateInstruments = [];
        const incomingInstruments = [];

        for (let i = 0; i < numInstruments; i++) {
            stateInstruments.push({ name: `Inst${i}`, steps: [0, 0, 0, 0] });
            incomingInstruments.push({ name: `Inst${i}`, steps: [1, 1, 1, 1], muted: false });
        }

        const iterations = 10000;

        // 1. Baseline: forEach + find
        const startFind = performance.now();
        for (let k = 0; k < iterations; k++) {
            incomingInstruments.forEach((di) => {
                const inst = stateInstruments.find((i) => i.name === di.name);
                if (inst) {
                    inst.steps = di.steps;
                    inst.muted = di.muted;
                }
            });
        }
        const endFind = performance.now();
        const durationFind = endFind - startFind;
        console.log(
            `Baseline (forEach + find) for ${iterations} iterations: ${durationFind.toFixed(2)}ms`,
        );

        // 2. Optimized: for loop + Map
        const startMap = performance.now();
        for (let k = 0; k < iterations; k++) {
            const instrumentMap = new Map();
            for (let i = 0; i < stateInstruments.length; i++) {
                instrumentMap.set(stateInstruments[i].name, stateInstruments[i]);
            }

            for (let i = 0; i < incomingInstruments.length; i++) {
                const di = incomingInstruments[i];
                const inst = instrumentMap.get(di.name);
                if (inst) {
                    inst.steps = di.steps;
                    inst.muted = di.muted;
                }
            }
        }
        const endMap = performance.now();
        const durationMap = endMap - startMap;
        console.log(
            `Optimized (Map + for loop) for ${iterations} iterations: ${durationMap.toFixed(2)}ms`,
        );

        console.log(`Speedup: ${(durationFind / durationMap).toFixed(2)}x`);
    });
});

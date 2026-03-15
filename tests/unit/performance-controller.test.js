import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    initAudio,
    killDrumNote,
    killSoloistNote,
    playDrumSound,
    playSoloNote,
} from '../../public/engine/engine.js';
import {
    stopDrums,
    stopSoloist,
    triggerDrumSound,
    triggerSoloNote,
} from '../../public/performance-controller.js';
import { stateMap } from '../../public/state.js';

// Mock the state
vi.mock('../../public/state.js', () => ({
    stateMap: { mockState: true },
}));

// Mock the engine functions
vi.mock('../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    killDrumNote: vi.fn(),
    killSoloistNote: vi.fn(),
    playDrumSound: vi.fn(),
    playSoloNote: vi.fn(),
}));

describe('Performance Controller', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('triggerSoloNote', () => {
        it('should initialize audio and play a solo note', () => {
            const freq = 440;
            const time = 1.0;
            const duration = 0.5;
            const vol = 0.8;
            const bend = 1;
            const style = 'blues';
            const isLegato = true;
            const vibrato = true;

            triggerSoloNote(freq, time, duration, vol, bend, style, isLegato, vibrato);

            expect(initAudio).toHaveBeenCalledWith(stateMap);
            expect(playSoloNote).toHaveBeenCalledWith(
                stateMap,
                freq,
                time,
                duration,
                vol,
                bend,
                style,
                isLegato,
                vibrato,
            );
        });

        it('should use default arguments correctly', () => {
            const freq = 440;
            const time = 1.0;
            const duration = 0.5;
            const vol = 0.8;

            triggerSoloNote(freq, time, duration, vol);

            expect(initAudio).toHaveBeenCalledWith(stateMap);
            expect(playSoloNote).toHaveBeenCalledWith(
                stateMap,
                freq,
                time,
                duration,
                vol,
                0,
                'scalar',
                false,
                false,
            );
        });
    });

    describe('stopSoloist', () => {
        it('should call killSoloistNote with stateMap', () => {
            stopSoloist();
            expect(killSoloistNote).toHaveBeenCalledWith(stateMap);
        });
    });

    describe('triggerDrumSound', () => {
        it('should initialize audio and play a drum sound', () => {
            const name = 'Kick';
            const time = 1.5;
            const velocity = 0.9;

            triggerDrumSound(name, time, velocity);

            expect(initAudio).toHaveBeenCalledWith(stateMap);
            expect(playDrumSound).toHaveBeenCalledWith(stateMap, name, time, velocity);
        });
    });

    describe('stopDrums', () => {
        it('should call killDrumNote with stateMap', () => {
            stopDrums();
            expect(killDrumNote).toHaveBeenCalledWith(stateMap);
        });
    });
});

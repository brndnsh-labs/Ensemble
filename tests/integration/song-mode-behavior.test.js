import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ACTIONS } from '../../public/types.js';
import { getState, dispatch } from '../../public/state.js';
import { scheduler } from '../../public/engine/scheduler-core.js';
import * as workerClient from '../../public/worker-client.js';
import { applyConductor } from '../../public/conductor.js';

// Mock worker client
vi.mock('../../public/worker-client.js', () => ({
    requestBuffer: vi.fn(),
    syncWorker: vi.fn(),
    flushWorker: vi.fn(),
    stopWorker: vi.fn(),
    startWorker: vi.fn(),
    requestResolution: vi.fn()
}));

describe('Song Mode Behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        dispatch(ACTIONS.RESET_STATE);
        const { playback, arranger } = getState();
        
        // Setup a multi-section arrangement
        // s1: 0-16 (Intro), s2: 16-32 (Verse)
        arranger.sections = [
            { id: 's1', label: 'Intro', value: 'I', repeat: 1 },
            { id: 's2', label: 'Verse', value: 'IV', repeat: 1 }
        ];
        arranger.stepMap = [];
        const mockChord = { 
            sectionId: 's1', 
            sectionLabel: 'Intro',
            freqs: [261.63], // C4
            rootMidi: 60,
            intervals: [0, 4, 7],
            beats: 4
        };
        for (let i = 0; i < 16; i++) {
            arranger.stepMap.push({ 
                start: i, 
                end: i + 1, 
                chord: { ...mockChord, sectionId: 's1', sectionLabel: 'Intro' } 
            });
        }
        for (let i = 16; i < 32; i++) {
            arranger.stepMap.push({ 
                start: i, 
                end: i + 1, 
                chord: { ...mockChord, sectionId: 's2', sectionLabel: 'Verse' } 
            });
        }
        arranger.sectionMap = [
            { id: 's1', start: 0, end: 16, label: 'Intro' },
            { id: 's2', start: 16, end: 32, label: 'Verse' }
        ];
        arranger.totalSteps = 32;
        arranger.timeSignature = '4/4';

        playback.isPlaying = true;
        playback.songMode = true;
        playback.sessionTimer = 1; // 1 minute
        playback.sessionStartTime = performance.now() - 70000; // Already expired
        playback.step = 0;
        playback.audio = { currentTime: 0 };
        playback.nextNoteTime = 0;
        playback.scheduleAheadTime = 0.1;
    });

    it('should trigger ending pending when song timer expires in Song Mode', () => {
        const { playback } = getState();
        playback.isEndingPending = false;
        
        // Run scheduler
        scheduler();
        
        expect(playback.isEndingPending).toBe(true);
    });

    it('should trigger resolution at section boundary (Step 16) in Song Mode', () => {
        const { playback } = getState();
        playback.isEndingPending = true;
        playback.step = 15; // Just before boundary
        playback.nextNoteTime = 0;
        playback.audio.currentTime = 0;
        playback.scheduleAheadTime = 0.5;

        scheduler(); // Schedules step 15
        
        // Advance to step 16
        expect(playback.step).toBe(16);
        
        // Run scheduler again at step 16
        scheduler();
        
        // Should have triggered resolution
        expect(workerClient.requestResolution).toHaveBeenCalledWith(16);
    });

    it('should NOT trigger resolution mid-section in Song Mode', () => {
        const { playback } = getState();
        playback.isEndingPending = true;
        playback.step = 4; // Mid-intro
        playback.nextNoteTime = 0;
        playback.audio.currentTime = 0;

        scheduler();
        
        expect(workerClient.requestResolution).not.toHaveBeenCalled();
        expect(playback.step).toBe(5);
    });

    it('should calculate lyricalBias based on section label', () => {
        dispatch(ACTIONS.RESET_STATE);
        const { playback, arranger } = getState();
        
        // Setup "Solo" section
        arranger.totalSteps = 16;
        arranger.stepMap = [{ start: 0, end: 16, chord: { sectionLabel: 'Solo' } }];
        playback.step = 0;
        playback.songMode = true;
        playback.sessionTimer = 0; // Disable arc for this test
        
        applyConductor();
        expect(playback.lyricalBias).toBe(0.2);

        // Setup "Verse" section
        arranger.stepMap = [{ start: 0, end: 16, chord: { sectionLabel: 'Verse' } }];
        applyConductor();
        expect(playback.lyricalBias).toBe(0.7);
    });
});

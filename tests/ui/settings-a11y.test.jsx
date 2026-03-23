/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from '../../public/components/Settings.jsx';
import { dispatch } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

// Mock dependencies
vi.mock('../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));
vi.mock('../../public/app-controller.js', () => ({
    applyTheme: vi.fn(),
}));
vi.mock('../../public/midi-controller.js', () => ({
    initMIDI: vi.fn(),
    panic: vi.fn(),
}));
vi.mock('../../public/engine/engine.js', () => ({
    restoreGains: vi.fn(),
}));
vi.mock('../../public/pwa.js', () => ({
    triggerInstall: vi.fn(),
}));

describe('Settings Accessibility', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="settingsContainer"></div>';

        // Ensure modal is "open" so we can interact with it (though render happens anyway)
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'settings', open: true });
        // Enable MIDI to see MIDI controls
        dispatch(ACTIONS.SET_MIDI_CONFIG, { enabled: true });

        render(<Settings />, document.getElementById('settingsContainer'));
        await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('should have aria-labels on Session Timer stepper buttons', () => {
        const decBtn = document.getElementById('sessionTimerDec');
        const incBtn = document.getElementById('sessionTimerInc');

        expect(decBtn).not.toBeNull();
        expect(incBtn).not.toBeNull();

        expect(decBtn.getAttribute('aria-label')).toBe('Decrease song duration');
        expect(incBtn.getAttribute('aria-label')).toBe('Increase song duration');
    });

    it('should have aria-labels on MIDI Channel and Octave inputs', () => {
        const channels = ['Chords', 'Bass', 'Soloist', 'Harmony', 'Drums'];

        channels.forEach((ch) => {
            const chanInput = document.getElementById(`midi${ch}Channel`);
            const octInput = document.getElementById(`midi${ch}Octave`);

            expect(chanInput).not.toBeNull();
            expect(octInput).not.toBeNull();

            expect(chanInput.getAttribute('aria-label')).toBe(`${ch} MIDI Channel`);
            expect(octInput.getAttribute('aria-label')).toBe(`${ch} MIDI Octave Offset`);
        });
    });

    it('should have aria-valuetext on MIDI sliders', () => {
        const latencySlider = document.getElementById('midiLatencySlider');
        const velocitySlider = document.getElementById('midiVelocitySlider');

        expect(latencySlider).not.toBeNull();
        expect(velocitySlider).not.toBeNull();

        // Check if aria-valuetext is present and formatted correctly
        // Latency defaults to 0 usually, but checking presence/format
        expect(latencySlider.hasAttribute('aria-valuetext')).toBe(true);
        expect(latencySlider.getAttribute('aria-valuetext')).toMatch(/-?\d+ ms/);

        expect(velocitySlider.hasAttribute('aria-valuetext')).toBe(true);
        expect(velocitySlider.getAttribute('aria-valuetext')).toMatch(/\d+\.\d+x/);
    });

    it('should have aria-valuetext on Master Volume slider', () => {
        const masterVol = document.getElementById('masterVolume');
        expect(masterVol).not.toBeNull();

        // Should be formatted as percentage
        expect(masterVol.hasAttribute('aria-valuetext')).toBe(true);
        expect(masterVol.getAttribute('aria-valuetext')).toMatch(/^\d+%$/);
    });

    it('should have aria-valuetext on Global Complexity slider', () => {
        const complexitySlider = document.getElementById('complexitySlider');
        expect(complexitySlider).not.toBeNull();

        // Should be one of Low, Medium, High
        const label = complexitySlider.getAttribute('aria-valuetext');
        expect(['Low', 'Medium', 'High']).toContain(label);
    });
});

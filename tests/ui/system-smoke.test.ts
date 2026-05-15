// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Worker and OffscreenCanvas for the system smoke tests
if (typeof global !== 'undefined') {
    global.Worker = class MockWorker {
        constructor() {
            this.postMessage = vi.fn();
            this.terminate = vi.fn();
            this.onmessage = null;
        }
    };
}

if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.transferControlToOffscreen = vi.fn(() => ({
        getContext: vi.fn(() => ({
            fillRect: vi.fn(),
            clearRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            fill: vi.fn(),
            arc: vi.fn(),
            scale: vi.fn(),
            resetTransform: vi.fn(),
            drawImage: vi.fn(),
        })),
    }));
}

const setupMinimalDOM = () => {
    document.body.innerHTML = `
        <div id="app">
            <button id="playBtn">
                <span id="playBtnText">START</span>
                <span id="playBtnTimer"></span>
            </button>
            <button id="addSectionBtn">Add Section</button>
            <div id="sectionList"></div>
            <div id="chordVisualizer"></div>
            <div id="sequencerGrid"></div>
            <div id="measurePagination"></div>
            <input id="bpmInput" value="120" />
            <select id="keySelect"><option value="C">C</option></select>
            <select id="timeSigSelect"><option value="4/4">4/4</option></select>
            <select id="notationSelect"><option value="name">Name</option></select>
            <select id="densitySelect"><option value="standard">Standard</option></select>
            <select id="drumBarsSelect"><option value="1">1</option></select>
            <input id="swingSlider" value="0" />
            <select id="swingBaseSelect"><option value="8th">8th</option></select>
            
            <input id="masterVolume" value="0.5" />
            <input id="chordVolume" value="0.5" />
            <input id="bassVolume" value="0.5" />
            <input id="soloistVolume" value="0.5" />
            <input id="drumVolume" value="0.5" />
            <input id="chordReverb" value="0.3" />
            <input id="bassReverb" value="0.1" />
            <input id="soloistReverb" value="0.6" />
            <input id="drumReverb" value="0.2" />
            
            <input id="countInCheck" type="checkbox" />
            <input id="metronomeCheck" type="checkbox" />
            <input id="visualFlashCheck" type="checkbox" />
            <input id="hapticCheck" type="checkbox" />
            <input id="autoIntensityCheck" type="checkbox" />
            <input id="soloistDoubleStops" type="checkbox" />
            
            <input id="intensitySlider" value="50" />
            <div id="intensityValue">50%</div>
            <input id="creativityCheck" type="checkbox" />
            <div id="complexitySlider"></div>
            
            <div id="panel-visualizer" class="collapsed"></div>
            <div id="flashOverlay" style="opacity: 0"></div>
            
            <button id="chordPowerBtn"></button>
            <button id="groovePowerBtn"></button>
            <button id="bassPowerBtn"></button>
            <button id="soloistPowerBtn"></button>
            <button id="chordPowerBtnDesktop"></button>
            <button id="groovePowerBtnDesktop"></button>
            <button id="bassPowerBtnDesktop"></button>
            <button id="soloistPowerBtnDesktop"></button>

            <button id="tapBtn"></button>
            <button id="relKeyBtn"></button>
            <button id="transUpBtn"></button>
            <button id="transDownBtn"></button>
            <button id="maximizeChordBtn"></button>
            <button id="inspirationHubBtn"></button>
            <div id="activeSectionLabel"></div>
            <div id="arrangerActionTrigger"></div>
            <div id="arrangerActionMenu"></div>
            <button id="mutateBtn"></button>
            <button id="undoBtn"></button>
            <button id="clearProgBtn"></button>
            <button id="saveBtn"></button>
            <button id="shareHubBtn"></button>
            <div id="chordPresets"></div>
            <div id="userPresetsContainer"></div>
            <div id="chordStylePresets"></div>
            <div id="bassStylePresets"></div>
            <div id="soloistStylePresets"></div>
            <div id="groupingToggle"></div>
            <div id="groupingLabel"></div>
            <div id="drumPresets"></div>
            <div id="userDrumPresetsContainer"></div>
            <button id="cloneMeasureBtn"></button>
            <input id="autoFollowCheck" type="checkbox" />
            <input id="humanizeSlider" value="0" />
            <button id="saveDrumBtn"></button>
            <div id="smartDrumPresets"></div>
            <div id="settingsOverlay" aria-hidden="true"></div>
            <button id="settingsBtn"></button>
            <select id="themeSelect"></select>
            <button id="exportMidiBtn"></button>
            <button id="settingsShareHubBtn"></button>
            <div id="shareOverlay" aria-hidden="true"></div>
            <button id="closeExportBtn"></button>
            <button id="confirmExportBtn"></button>
            <input id="exportChordsCheck" type="checkbox" />
            <input id="exportBassCheck" type="checkbox" />
            <input id="exportSoloistCheck" type="checkbox" />
            <input id="exportDrumsCheck" type="checkbox" />
            <input id="exportDurationInput" />
            <div id="exportDurationContainer"></div>
            <button id="exportDurationDec"></button>
            <button id="exportDurationInc"></button>
            <div id="exportDurationStepper"></div>
            <input id="exportFilenameInput" />
            <button id="installAppBtn"></button>
            <button id="resetSettingsBtn"></button>
            <button id="refreshAppBtn"></button>
            <div id="editorOverlay" aria-hidden="true"></div>
            <button id="editArrangementBtn"></button>
            <button id="closeEditorBtn"></button>
            <input id="sessionTimerCheck" type="checkbox" />
            <input id="sessionTimerInput" />
            <div id="sessionTimerDurationContainer"></div>
            <button id="sessionTimerDec"></button>
            <button id="sessionTimerInc"></button>
            <div id="sessionTimerStepper"></div>
            <input id="midiEnableCheck" type="checkbox" />
            <input id="midiMuteLocalCheck" type="checkbox" />
            <select id="midiOutputSelect"></select>
            <input id="midiChordsChannel" />
            <input id="midiBassChannel" />
            <input id="midiSoloistChannel" />
            <input id="midiDrumsChannel" />
            <input id="midiLatencySlider" />
            <div id="midiLatencyValue"></div>
            <div id="midiControls"></div>
            <input id="midiChordsOctave" />
            <input id="midiBassOctave" />
            <input id="midiSoloistOctave" />
            <input id="midiDrumsOctave" />
            <input id="midiVelocitySlider" />
            <div id="midiVelocityValue"></div>
            <input id="applyPresetSettingsCheck" type="checkbox" />
            <button id="closeSettingsBtn"></button>
            <div id="bpmControlGroup"></div>
            <button id="clearDrumsBtn"></button>
            <button id="liveListenBtn"></button>
            <div id="liveChordDisplay"></div>
            <button id="captureLiveHistoryBtn"></button>
            <div id="bpm-label"></div>
            <div id="generateSongOverlay" aria-hidden="true"></div>
        </div>
    `;
};

// Mock dependencies
vi.mock('../../public/worker-client.js', () => ({
    syncWorker: vi.fn(),
    startWorker: vi.fn(),
    stopWorker: vi.fn(),
    requestBuffer: vi.fn(),
    flushWorker: vi.fn(),
}));

vi.mock('../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    playNote: vi.fn(),
    playDrumSound: vi.fn(),
    playBassNote: vi.fn(),
    playSoloNote: vi.fn(),
    restoreGains: vi.fn(),
    killAllNotes: vi.fn(),
    killChordBus: vi.fn(),
    killBassBus: vi.fn(),
    killSoloistBus: vi.fn(),
    killDrumBus: vi.fn(),
    killHarmonyBus: vi.fn(),
    killAllPianoNotes: vi.fn(),
    killSoloistNote: vi.fn(),
    killBassNote: vi.fn(),
    killDrumNote: vi.fn(),
    killHarmonyNote: vi.fn(),
    updateSustain: vi.fn(),
    getVisualTime: () => 0,
}));

vi.mock('../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
    loadSavedState: vi.fn(),
    debounceSaveState: vi.fn(),
}));

import { dispatch, getState } from '../../public/state.js';

const { arranger, playback } = getState();

import { addSection, onSectionUpdate } from '../../public/arranger-controller.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { initAudio } from '../../public/engine/engine.js';
import { togglePlay } from '../../public/engine/scheduler-core.js';

describe('System Smoke Test (E2E Workflow)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupMinimalDOM();

        arranger.sections = [];
        arranger.progression = [];
        playback.isPlaying = false;
        playback.audio = null;

        const mockAudioContext = {
            currentTime: 0,
            state: 'suspended',
            resume: vi.fn(),
            suspend: vi.fn(),
            createGain: () => ({
                gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
                connect: vi.fn(),
            }),
            createOscillator: () => ({
                frequency: { value: 440, setValueAtTime: vi.fn() },
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
            }),
            createBufferSource: () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn() }),
            createBiquadFilter: () => ({
                connect: vi.fn(),
                frequency: { value: 1000, setValueAtTime: vi.fn() },
                Q: { value: 1 },
            }),
        };

        global.AudioContext = vi.fn().mockImplementation(() => mockAudioContext);

        vi.mocked(initAudio).mockImplementation(() => {
            playback.audio = mockAudioContext;
        });

        global.navigator.wakeLock = { request: vi.fn().mockResolvedValue({ release: vi.fn() }) };
    });

    it('should complete a full "Song Creation to Playback" cycle without crashing', () => {
        addSection();
        expect(arranger.sections.length).toBeGreaterThanOrEqual(1);
        const sectionId = arranger.sections[0].id;

        onSectionUpdate(sectionId, 'value', 'C | G | Am | F');

        validateProgression(getState());
        expect(arranger.progression.length).toBeGreaterThan(0);

        togglePlay(getState(), false, dispatch);

        expect(playback.isPlaying).toBe(true);
        expect(playback.audio).not.toBeNull();

        togglePlay(getState(), false, dispatch);
        expect(playback.isPlaying).toBe(false);
    });

    it('should update the progression when a chord is edited in a section', () => {
        addSection();
        const sectionId = arranger.sections[0].id;
        onSectionUpdate(sectionId, 'value', 'C | G');
        validateProgression(getState());
        expect(arranger.progression[0].absName).toBe('C');
        expect(arranger.progression[1].absName).toBe('G');

        // Update the value
        onSectionUpdate(sectionId, 'value', 'C | F');
        validateProgression(getState());
        expect(arranger.progression[0].absName).toBe('C');
        expect(arranger.progression[1].absName).toBe('F');
    });
});

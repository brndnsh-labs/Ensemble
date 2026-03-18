import { getState, storage } from './state.js';

/** @type {ReturnType<typeof setTimeout> | undefined} */
let saveTimeout;

export function saveCurrentState() {
    const { arranger, playback, chords, bass, soloist, harmony, groove, vizState, midi } =
        getState();
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    const data = {
        sections: arranger.sections,
        key: arranger.key,
        timeSignature: arranger.timeSignature,
        isMinor: arranger.isMinor,
        notation: arranger.notation,
        lastChordPreset: arranger.lastChordPreset,
        theme: playback.theme,
        bpm: playback.bpm,
        metronome: playback.metronome,
        visualFlash: playback.visualFlash,
        haptic: playback.haptic,
        countIn: playback.countIn,
        applyPresetSettings: playback.applyPresetSettings,
        sessionTimer: playback.sessionTimer,
        songMode: playback.songMode,
        vizEnabled: vizState.enabled,
        autoIntensity: playback.autoIntensity,
        practiceMode: playback.practiceMode,
        masterVolume: playback.masterVolume,
        chords: {
            enabled: chords.enabled,
            style: chords.style,
            instrument: /** @type {any} */ (chords).instrument,
            octave: chords.octave,
            density: chords.density,
            volume: chords.volume,
            reverb: chords.reverb,
            pianoRoots: chords.pianoRoots,
            activeTab: chords.activeTab,
        },
        bass: {
            enabled: bass.enabled,
            style: bass.style,
            octave: bass.octave,
            volume: bass.volume,
            reverb: bass.reverb,
            activeTab: bass.activeTab,
        },
        soloist: {
            enabled: soloist.enabled,
            style: soloist.style,
            preset: soloist.preset,
            octave: soloist.octave,
            volume: soloist.volume,
            reverb: soloist.reverb,
            mode: soloist.mode,
            activeTab: soloist.activeTab,
        },
        harmony: {
            enabled: harmony.enabled,
            style: harmony.style,
            octave: harmony.octave,
            volume: harmony.volume,
            reverb: harmony.reverb,
            complexity: harmony.complexity,
            activeTab: harmony.activeTab,
        },
        groove: {
            enabled: groove.enabled,
            volume: groove.volume,
            reverb: groove.reverb,
            swing: groove.swing,
            swingSub: groove.swingSub,
            followPlayback: groove.followPlayback,
            humanize: groove.humanize,
            lastDrumPreset: groove.lastDrumPreset,
            genreFeel: groove.genreFeel,
            larsMode: groove.larsMode,
            larsIntensity: groove.larsIntensity,
            lastSmartGenre: groove.lastSmartGenre,
            activeTab: groove.activeTab,
            mobileTab: groove.mobileTab,
            creativity: groove.creativity,
            sectionSeedMap: groove.sectionSeedMap,
            pattern: groove.instruments.map((inst) => ({
                name: inst.name,
                steps: [...inst.steps],
            })),
        },
        midi: {
            enabled: midi.enabled,
            selectedOutputId: midi.selectedOutputId,
            chordsChannel: midi.chordsChannel,
            bassChannel: midi.bassChannel,
            soloistChannel: midi.soloistChannel,
            harmonyChannel: midi.harmonyChannel,
            drumsChannel: midi.drumsChannel,
            chordsOctave: midi.chordsOctave,
            bassOctave: midi.bassOctave,
            soloistOctave: midi.soloistOctave,
            harmonyOctave: midi.harmonyOctave,
            drumsOctave: midi.drumsOctave,
            latency: midi.latency,
            muteLocal: midi.muteLocal,
            velocitySensitivity: midi.velocitySensitivity,
        },
    };
    storage.save('currentState', data);
}

export function debounceSaveState() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(saveCurrentState, 1000);
}

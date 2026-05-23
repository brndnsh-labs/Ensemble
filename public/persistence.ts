import { MIXER_SETTINGS_VERSION } from './state/instruments.js';
import { getState, storage } from './state.js';

let saveTimeout: ReturnType<typeof setTimeout> | undefined;

export function saveCurrentState(): void {
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
        seed: arranger.seed,
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
        mixerVersion: MIXER_SETTINGS_VERSION,
        chords: {
            enabled: chords.enabled,
            voice: chords.voice,
            style: chords.style,
            instrument: (chords as any).instrument,
            octave: chords.octave,
            density: chords.density,
            volume: chords.volume,
            reverb: chords.reverb,
        },
        bass: {
            enabled: bass.enabled,
            voice: bass.voice,
            style: bass.style,
            octave: bass.octave,
            volume: bass.volume,
            reverb: bass.reverb,
        },
        soloist: {
            enabled: soloist.enabled,
            voice: soloist.voice,
            style: soloist.style,
            preset: soloist.preset,
            octave: soloist.octave,
            volume: soloist.volume,
            reverb: soloist.reverb,
            mode: soloist.mode,
        },
        harmony: {
            enabled: harmony.enabled,
            voice: harmony.voice,
            style: harmony.style,
            octave: harmony.octave,
            volume: harmony.volume,
            reverb: harmony.reverb,
            complexity: harmony.complexity,
        },
        groove: {
            enabled: groove.enabled,
            voice: groove.voice,
            volume: groove.volume,
            reverb: groove.reverb,
            swing: groove.swing,
            swingSub: groove.swingSub,
            followPlayback: groove.followPlayback,
            humanize: groove.humanize,
            lastDrumPreset: groove.lastDrumPreset,
            genreFeel: groove.genreFeel,
            lastSmartGenre: groove.lastSmartGenre,
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

export function debounceSaveState(): void {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(saveCurrentState, 1000);
}

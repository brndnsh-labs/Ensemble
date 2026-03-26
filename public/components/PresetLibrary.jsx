import { useEffect, useState } from 'preact/hooks';

import { validateAndAnalyze } from '../arranger-controller.js';
import { CHORD_PRESETS } from '../data/chord-presets.js';
import { flushBuffers } from '../instrument-controller.js';
import { saveCurrentState } from '../persistence.js';
import { dispatch, getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { decompressSections, generateId } from '../utils.js';

/**
 * @typedef {import('../state/arranger.js').Section} Section
 * @typedef {{ bpm?: number, style?: string, timeSignature?: string }} PresetSettings
 * @typedef {{
 *   name: string,
 *   sections: string | Array<Partial<Section>>,
 *   category?: string,
 *   isMinor?: boolean,
 *   timestamp?: number,
 *   settings?: PresetSettings
 * }} LibraryPreset
 */

/**
 * @param {{ onSelect?: (() => void) | undefined }} props
 */
export function PresetLibrary({ onSelect }) {
    const [isDirty, setIsDirty] = useState(false);
    const [lastChordPreset, setLastChordPreset] = useState('');
    const [userPresets, setUserPresets] = useState(/** @type {LibraryPreset[]} */ ([]));

    useEffect(() => {
        const loadUserPresets = () => {
            try {
                const stored = localStorage.getItem('ensemble_userPresets');
                setUserPresets(stored ? JSON.parse(stored) : []);
            } catch {
                setUserPresets([]);
            }
        };

        loadUserPresets();
        window.addEventListener('storage', loadUserPresets);
        return () => window.removeEventListener('storage', loadUserPresets);
    }, []);

    useEffect(() => {
        const refreshDirtyState = () => {
            const state = getState();
            setLastChordPreset(state.arranger?.lastChordPreset || '');
            setIsDirty(Boolean(state.arranger?.isDirty));
        };

        refreshDirtyState();
        const intervalId = window.setInterval(refreshDirtyState, 500);
        return () => window.clearInterval(intervalId);
    }, []);

    /**
     * @param {LibraryPreset} preset
     * @returns {Section[]}
     */
    const getPresetSections = (preset) => {
        const rawSections =
            typeof preset.sections === 'string'
                ? decompressSections(preset.sections)
                : Array.isArray(preset.sections)
                  ? preset.sections
                  : [];

        return rawSections.map((section, index) => ({
            id: section.id || generateId(),
            label: section.label || `Section ${index + 1}`,
            value: section.value || '',
            repeat: section.repeat || 1,
            key: section.key,
            timeSignature: section.timeSignature,
            seamless: section.seamless,
        }));
    };

    /**
     * @param {LibraryPreset} preset
     */
    const handleSelect = (preset) => {
        const sections = getPresetSections(preset);
        if (sections.length === 0) {
            return;
        }

        flushBuffers();
        dispatch(ACTIONS.SET_ARRANGEMENT, sections);
        dispatch(ACTIONS.SET_IS_MINOR, !!preset.isMinor);

        const { playback } = getState();
        if (playback.applyPresetSettings) {
            if (preset.settings?.timeSignature) {
                dispatch(ACTIONS.SET_TIME_SIGNATURE, preset.settings.timeSignature);
            }
            if (typeof preset.settings?.bpm === 'number') {
                dispatch(ACTIONS.SET_BPM, preset.settings.bpm);
            }
            if (preset.settings?.style) {
                dispatch(ACTIONS.SET_STYLE, { module: 'chords', style: preset.settings.style });
            }
        }

        dispatch(ACTIONS.SET_PARAM, {
            module: 'arranger',
            param: 'lastChordPreset',
            value: preset.name,
        });
        dispatch(ACTIONS.SET_PARAM, {
            module: 'arranger',
            param: 'isDirty',
            value: false,
        });

        validateAndAnalyze();
        saveCurrentState();
        onSelect?.();
    };

    /**
     * @param {LibraryPreset} preset
     */
    const handleDelete = (preset) => {
        if (!confirm(`Delete user preset "${preset.name}"?`)) {
            return;
        }

        try {
            const updated = userPresets.filter(
                (candidate) =>
                    candidate.timestamp !== preset.timestamp || candidate.name !== preset.name,
            );
            localStorage.setItem('ensemble_userPresets', JSON.stringify(updated));
            setUserPresets(updated);
        } catch {
            alert('Failed to delete user preset.');
        }
    };

    /**
     * @param {LibraryPreset} preset
     */
    const getMeta = (preset) => {
        if (preset.category) {
            return preset.category;
        }
        return 'Custom progression';
    };

    const activeName = isDirty ? null : lastChordPreset;

    return (
        <div class="preset-library">
            <div class="preset-library-section">
                <h4>Library</h4>
                <div class="preset-chip-grid">
                    {CHORD_PRESETS.map((preset) => (
                        <button
                            type="button"
                            key={preset.name}
                            class={`preset-chip chord-preset-chip ${activeName === preset.name ? 'active' : ''}`}
                            data-category={preset.category}
                            data-id={preset.name}
                            onClick={() => handleSelect(preset)}
                        >
                            <span class="preset-chip-name">{preset.name}</span>
                            <span class="preset-chip-meta">{getMeta(preset)}</span>
                        </button>
                    ))}
                </div>
            </div>

            {userPresets.length > 0 && (
                <div class="preset-library-section">
                    <h4>Your presets</h4>
                    <div class="preset-chip-grid">
                        {userPresets.map((preset) => (
                            <div
                                key={`${preset.name}-${preset.timestamp || 'user'}`}
                                class="preset-chip-stack"
                            >
                                <button
                                    type="button"
                                    class={`preset-chip chord-preset-chip ${activeName === preset.name ? 'active' : ''}`}
                                    data-category="User"
                                    data-id={preset.name}
                                    onClick={() => handleSelect(preset)}
                                >
                                    <span class="preset-chip-name">{preset.name}</span>
                                    <span class="preset-chip-meta">{getMeta(preset)}</span>
                                </button>
                                <button
                                    type="button"
                                    class="preset-chip-delete"
                                    aria-label={`Delete preset ${preset.name}`}
                                    onClick={() => handleDelete(preset)}
                                >
                                    Delete
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

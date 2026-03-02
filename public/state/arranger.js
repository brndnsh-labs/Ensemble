import { ACTIONS } from '../types.js';

/**
 * @typedef {Object} Section
 * @property {string} id - Unique identifier for the section.
 * @property {string} label - Display name (e.g., "Verse", "Chorus").
 * @property {string} value - The chord progression string (e.g., "I | IV").
 * @property {string} [color] - Optional color hex code for UI accent.
 * @property {number} [repeat] - Number of times to repeat this section (default 1).
 * @property {string} [key] - Local key for this section (e.g., "G").
 * @property {string} [timeSignature] - Local time signature for this section (e.g., "3/4").
 * @property {boolean} [seamless] - Whether this section transitions seamlessly from the previous one (suppresses fills).
 */

/**
 * @typedef {Object} ArrangerState
 * @property {Array<Section>} sections - List of song sections.
 * @property {Array<Object>} progression - Flattened list of parsed chord objects.
 * @property {string} key - The global musical key (e.g., "C", "F#").
 * @property {string} timeSignature - The global time signature (e.g., "4/4", "3/4").
 * @property {boolean} isMinor - Whether the key is minor.
 * @property {string} notation - Notation style ('roman', 'nns', 'name').
 * @property {boolean} valid - Whether the current progression is valid.
 * @property {number} totalSteps - Total number of 16th note steps in the song.
 * @property {Array<{start: number, end: number, chord: Object}>} stepMap - Map of steps to chord objects.
 * @property {Array<{start: number, end: number, ts: string}>} measureMap - Map of measures to time signatures.
 * @property {Array<{id: string, start: number, end: number, label: string}>} sectionMap - Map of sections to step ranges.
 * @property {Array<string>} history - Undo history stack (JSON strings).
 * @property {string} lastInteractedSectionId - ID of the last edited section.
 * @property {string} lastChordPreset - Name of the last loaded chord preset.
 * @property {boolean} isDirty - Whether the arrangement has been manually modified.
 * @property {Array<number>|null} grouping - Custom rhythmic grouping array (e.g. [3, 2]).
 */
export const arranger = {
    sections: [{ id: 's1', label: 'Intro', value: 'I | V | vi | IV', color: '#3b82f6', repeat: 1 }],
    progression: [],
    key: 'C',
    timeSignature: '4/4',
    grouping: null,
    isMinor: false,
    notation: 'roman',
    valid: false,
    totalSteps: 0,
    stepMap: [],
    measureMap: [],
    sectionMap: [],
    history: [],
    lastInteractedSectionId: 's1',
    lastChordPreset: 'Pop (Standard)',
    isDirty: false,
};

export function arrangerReducer(action, payload) {
    switch (action) {
        case ACTIONS.IMPORT_MUSICXML:
            if (payload.hasChords) {
                Object.assign(arranger, {
                    sections: payload.sections,
                    isDirty: true,
                    notation: 'name',
                });
            } else {
                arranger.isDirty = true;
            }
            break;
        case ACTIONS.RESET_STATE:
            Object.assign(arranger, {
                sections: [
                    {
                        id: 's1',
                        label: 'Intro',
                        value: 'I | V | vi | IV',
                        color: '#3b82f6',
                        repeat: 1,
                    },
                ],
                key: 'C',
                timeSignature: '4/4',
                notation: 'roman',
                isMinor: false,
                isDirty: false,
                history: [],
                grouping: null,
            });
            return true;
        case ACTIONS.SET_NOTATION:
            Object.assign(arranger, { notation: payload });
            return true;
        case ACTIONS.SET_ARRANGEMENT:
            arranger.sections = payload;
            return true;
    }
    return false;
}

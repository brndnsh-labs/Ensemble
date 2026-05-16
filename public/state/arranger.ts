import { deepSignal } from 'deepsignal';
import type { Action, Chord } from '../types.js';
import { ACTIONS } from '../types.js';

export interface Section {
    /** Unique identifier for the section. */
    id: string;
    /** Display name (e.g., "Verse", "Chorus"). */
    label: string;
    /** The chord progression string (e.g., "I | IV"). */
    value: string;
    /** Optional color hex code for UI accent. */
    color?: string;
    /** Number of times to repeat this section (default 1). */
    repeat?: number;
    /** Local key for this section (e.g., "G"). */
    key?: string;
    /** Whether the local key should be treated as minor. */
    isMinor?: boolean;
    /** Local time signature for this section (e.g., "3/4"). */
    timeSignature?: string;
    /** Whether this section transitions seamlessly from the previous one (suppresses fills). */
    seamless?: boolean;
}

export interface ArrangerState {
    /** List of song sections. */
    sections: Section[];
    /** Flattened list of parsed chord objects. */
    progression: Chord[];
    /** The global musical key (e.g., "C", "F#"). */
    key: string;
    /** The global time signature (e.g., "4/4", "3/4"). */
    timeSignature: string;
    /** Whether the key is minor. */
    isMinor: boolean;
    /** Notation style ('roman', 'nns', 'name'). */
    notation: string;
    /** Whether the current progression is valid. */
    valid: boolean;
    /** Total number of 16th note steps in the song. */
    totalSteps: number;
    /** Map of steps to chord objects. */
    stepMap: Array<{ start: number; end: number; chord: Chord }>;
    /** Map of measures to time signatures. */
    measureMap: Array<{ start: number; end: number; ts: string }>;
    /** Map of sections to step ranges. */
    sectionMap: Array<{ id: string; start: number; end: number; label: string }>;
    /** Undo history stack (JSON strings). */
    history: string[];
    /** ID of the last edited section. */
    lastInteractedSectionId: string;
    /** Name of the last loaded chord preset. */
    lastChordPreset: string;
    /** ID of a section that was programmatically mutated. */
    mutatedSectionId: string | null;
    /** Whether the arrangement has been manually modified. */
    isDirty: boolean;
    /** Custom rhythmic grouping array (e.g. [3, 2]). */
    grouping: number[] | null;
}

export const arranger = deepSignal<ArrangerState>({
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
    mutatedSectionId: null,
    isDirty: false,
});

export function arrangerReducer(action: Action): boolean {
    switch (action.type) {
        case ACTIONS.SET_PARAM:
            if (action.payload.module === 'arranger') {
                (arranger as any)[action.payload.param] = action.payload.value;
                return true;
            }
            break;
        case ACTIONS.RESET_STATE:
            arranger.sections = [
                {
                    id: 's1',
                    label: 'Intro',
                    value: 'I | V | vi | IV',
                    color: '#3b82f6',
                    repeat: 1,
                },
            ];
            arranger.key = 'C';
            arranger.timeSignature = '4/4';
            arranger.notation = 'roman';
            arranger.isMinor = false;
            arranger.isDirty = false;
            arranger.history = [];
            arranger.grouping = null;
            return true;
        case ACTIONS.SET_NOTATION:
            arranger.notation = action.payload;
            return true;
        case ACTIONS.SET_TIME_SIGNATURE:
            arranger.timeSignature = action.payload;
            return true;
        case ACTIONS.SET_KEY:
            arranger.key = action.payload;
            return true;
        case ACTIONS.LOAD_TEMPLATE:
            arranger.sections = action.payload.sections;
            if (action.payload.isMinor !== undefined) {
                arranger.isMinor = action.payload.isMinor;
            }
            arranger.isDirty = true;
            return true;
        case ACTIONS.SET_ARRANGEMENT:
            arranger.sections = action.payload;
            return true;
    }
    return false;
}

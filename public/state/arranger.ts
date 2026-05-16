import { deepSignal } from 'deepsignal';
import type { Action, ArrangerState, Section } from '../types.js';
import { ACTIONS } from '../types.js';

export type { ArrangerState, Section };

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

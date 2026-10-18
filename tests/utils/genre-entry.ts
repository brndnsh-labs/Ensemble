import { SMART_GENRES } from '../../core/data/smart-genres.js';
import { resolveAutoVoices } from '../../core/state/state-effects.js';
import { dispatch, getState } from '../../core/state.js';
import { ACTIONS } from '../../core/types.js';
import { resetAllStateForTest } from './reset-state.js';

/** Picker payload plus the auto-voice effect, as `setGenre` runs them: real presets. */
export async function enterGenre(genre: string, meter = '4/4') {
    resetAllStateForTest();
    // #1381 — ACTIONS.SET_TIME_SIGNATURE was deleted (nothing dispatched it); the live
    // meter write goes through generic SET_PARAM instead.
    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'timeSignature', value: meter });
    dispatch(ACTIONS.SET_GENRE_FEEL, { genreName: genre, ...SMART_GENRES[genre] });
    resolveAutoVoices(getState(), genre, dispatch);
    return getState();
}

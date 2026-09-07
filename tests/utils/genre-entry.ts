import { SMART_GENRES } from '../../public/data/smart-genres.js';
import { reconcileUrlGenreOnBoot } from '../../public/state/state-effects.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

/** Picker payload plus the awaited boot effect: real presets, no style overrides. */
export async function enterGenre(genre: string, meter = '4/4') {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, meter);
    dispatch(ACTIONS.SET_GENRE_FEEL, { genreName: genre, ...SMART_GENRES[genre] });
    await reconcileUrlGenreOnBoot(getState(), genre, null, dispatch);
    return getState();
}

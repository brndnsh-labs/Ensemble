import { BAND_ENGINE } from '../lib/engine-mode';

export const lanes = [
    ['groove', 'Drums'],
    ['bass', 'Bass'],
    ['chords', 'Chords'],
    ['harmony', 'Harmony'],
    ['soloist', 'Soloist'],
] as const;
export type Lane = (typeof lanes)[number][0];

/**
 * The band engine (docs/design/band-engine.md) has no harmony lane: its roles
 * are drums, bass, comp and the lead (the soloist lane). Every surface that lists lanes (the
 * transport's mute chips, the Sounds panel's per-lane voice/style/volume controls) reads this
 * instead of `lanes` directly, so a lane the engine can't play never shows a control for it.
 * `BAND_ENGINE` is read once here, at module load, matching how `lib/runtime.ts` itself reads
 * it — never re-read per render.
 */
export const visibleLanes = BAND_ENGINE ? lanes.filter(([key]) => key !== 'harmony') : lanes;

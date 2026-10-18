/**
 * The band's lanes, in the order every surface lists them (the transport's mute chips, the
 * Sounds panel's per-lane voice/volume controls). The band engine (docs/design/band-engine.md)
 * plays drums, bass, comp and the lead (the soloist lane) and has no harmony lane, so a chart no
 * longer carries one (DECISION 2026-09-26) and no surface shows a control for it.
 */
export const visibleLanes = [
    ['groove', 'Drums'],
    ['bass', 'Bass'],
    ['chords', 'Chords'],
    ['soloist', 'Soloist'],
] as const;
export type Lane = (typeof visibleLanes)[number][0];

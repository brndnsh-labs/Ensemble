export const lanes = [
    ['groove', 'Drums'],
    ['bass', 'Bass'],
    ['chords', 'Chords'],
    ['harmony', 'Harmony'],
    ['soloist', 'Soloist'],
] as const;
export type Lane = (typeof lanes)[number][0];

/**
 * The band engine (docs/design/band-engine.md) has no harmony lane: its roles are drums, bass,
 * comp and the lead (the soloist lane). Every surface that lists lanes (the transport's mute
 * chips, the Sounds panel's per-lane voice/volume controls) reads this instead of `lanes`
 * directly, so a lane the band can't play never shows a control for it. A chart still carries
 * its harmony lane's settings; nothing plays them.
 */
export const visibleLanes = lanes.filter(([key]) => key !== 'harmony');

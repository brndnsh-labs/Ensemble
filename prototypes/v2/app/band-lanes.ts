export const lanes = [
    ['groove', 'Drums'],
    ['bass', 'Bass'],
    ['chords', 'Chords'],
    ['harmony', 'Harmony'],
    ['soloist', 'Soloist'],
] as const;
export type Lane = (typeof lanes)[number][0];

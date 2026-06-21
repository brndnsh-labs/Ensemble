export interface StyleEntry {
    id: string;
    name: string;
    category: string;
}

export const CHORD_STYLES: StyleEntry[] = [
    { id: 'smart', name: 'Smart (Rhythmic)', category: 'Modern' },
    { id: 'pad', name: 'Pad (Sustain)', category: 'Modern' },
    { id: 'strum8', name: 'Strum (8th)', category: 'Pop/Rock' },
    { id: 'strum-country', name: 'Country Strum', category: 'Country/Folk' },
    { id: 'power-metal', name: 'Power Metal', category: 'Rock/Metal' },
    { id: 'jazz', name: 'Jazz Comp', category: 'Jazz' },
    { id: 'funk', name: 'Funk Scratch', category: 'Soul/Funk' },
    { id: 'ska-upstroke', name: 'Ska Upstroke', category: 'Pop/Rock' },
];

export const BASS_STYLES: StyleEntry[] = [
    { id: 'smart', name: 'Smart (Auto)', category: 'Experimental' },
    // #628: the 'whole' drone style was retired with the Minimal phantom genre
    // (its only route). An old persisted/shared session with bass.style 'whole'
    // now falls through hydration's BASS_STYLES guard to the 'smart' default
    // (genre-routed bass) — graceful, never silent.
    { id: 'rock', name: 'Rock (8th)', category: 'Pop/Rock' },
    { id: 'country', name: 'Country (1-5)', category: 'Country/Folk' },
    { id: 'metal', name: 'Metal (Gallop)', category: 'Rock/Metal' },
    { id: 'quarter', name: 'Walking', category: 'Jazz' },
    { id: 'funk', name: 'Funk', category: 'Soul/Funk' },
    { id: 'disco', name: 'Disco (Octaves)', category: 'Soul/Funk' },
    { id: 'dub', name: 'Dub (Reggae)', category: 'World/Latin' },
    { id: 'neo', name: 'Neo-Soul', category: 'Soul/R&B' },
    { id: 'bossa', name: 'Bossa Nova', category: 'World/Latin' },
    { id: 'blues', name: 'Blues (Shuffle/Box)', category: 'Blues' },
    { id: 'acoustic', name: 'Acoustic (Warm)', category: 'Country/Folk' },
    { id: 'hiphop', name: 'Hip Hop (808/Sub)', category: 'Electronic' },
    { id: 'walking-ska', name: 'Walking (Ska)', category: 'Pop/Rock' },
];

// #628: the one soloist voice per canonical genre (the 13). The manual soloist
// picker is gone, so this list now serves two consumers: the auto-generated
// MANUAL.md style table and share-URL hydration validation (state-hydration.ts).
// Ids match the voices the 13 genres actually resolve to via smart-genres.ts
// `.soloist`; the retired `shred`/`minimal` phantom profiles are gone.
export const SOLOIST_STYLES: StyleEntry[] = [
    { id: 'smart', name: 'Smart (Auto)', category: 'Experimental' },
    { id: 'rock', name: 'Rock', category: 'Rock/Metal' },
    { id: 'metal', name: 'Metal', category: 'Rock/Metal' },
    { id: 'bird', name: 'Bird (Jazz)', category: 'Jazz' },
    { id: 'bossa', name: 'Bossa', category: 'Jazz' },
    { id: 'blues', name: 'Blues', category: 'Blues' },
    { id: 'funk', name: 'Funk', category: 'Soul/Funk' },
    { id: 'disco', name: 'Disco', category: 'Soul/Funk' },
    { id: 'neo', name: 'Neo-Soul', category: 'Soul/R&B' },
    { id: 'hiphop', name: 'Hip Hop', category: 'Modern' },
    { id: 'reggae', name: 'Reggae', category: 'Modern' },
    { id: 'ska-horns', name: 'Ska Horns', category: 'Modern' },
    { id: 'country', name: 'Country', category: 'Country/Folk' },
    { id: 'acoustic', name: 'Acoustic', category: 'Country/Folk' },
];

export const HARMONY_STYLES: StyleEntry[] = [
    { id: 'smart', name: 'Smart (Auto)', category: 'Experimental' },
    { id: 'horns', name: 'Horns (Stabs)', category: 'Modern' },
    { id: 'strings', name: 'Strings (Pads)', category: 'Classical/Trad' },
    { id: 'organ', name: 'Organ (B3)', category: 'Soul/Funk' },
    { id: 'plucks', name: 'Modern Synth (Plucks)', category: 'Electronic' },
    { id: 'counter', name: 'Contrapuntal', category: 'Jazz' },
];

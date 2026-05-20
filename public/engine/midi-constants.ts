/** Maps drum instrument names to standard MIDI drum notes (General MIDI). */
export const DRUM_MAP: Record<string, number> = {
    Kick: 36,
    Snare: 38,
    HiHat: 42,
    Open: 46,
    Crash: 49,
    Ride: 51,
    Rim: 37,
    Clap: 39,
    Cowbell: 56,
    // why: GM has no dedicated brush note; the live engine renders 'Brush' as
    // a soft sweep on the snare voice. Side Stick (37) is the softest GM
    // snare-family note and round-trips the gesture without spuriously
    // triggering a hard backbeat on import.
    Brush: 37,
    Shaker: 70,
    Clave: 75,
    Conga: 63,
    Bongo: 60,
    Perc: 67,
    Guiro: 74,
    'High Tom': 50,
    'Mid Tom': 47,
    'Low Tom': 43,
    Sidestick: 37,
    Agogo: 67,
    'High Agogo': 67,
    'Low Agogo': 68,
    // why: epic-deferred-followups S8(d) — Conga/Bongo variant keys use the
    // suffix-first convention (`<Root><Variant>`), matching Agogo/Cowbell in
    // KNOWN_SOUND_NAMES / DISPATCHER_FAMILIES (synth-drums.ts). Previously the
    // three layers disagreed (DRUM_MAP space-form, KNOWN_SOUND_NAMES
    // modifier-first, dispatcher suffix-first). General-MIDI conga/bongo notes.
    BongoHigh: 60,
    BongoLow: 61,
    CongaHigh: 62,
    CongaLow: 64,
    CongaOpen: 63,
    CongaMute: 62,
    CongaSlap: 63,
};

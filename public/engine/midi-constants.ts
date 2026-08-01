/** Maps drum instrument names to standard MIDI drum notes (General MIDI). */
export const DRUM_MAP: Record<string, number> = {
    Kick: 36,
    Snare: 38,
    HiHat: 42,
    Open: 46,
    // why: Epic 4 S3 hi-hat articulations. GM 44 is Pedal Hi-Hat (a dedicated
    // note); GM has no in-between, so quarter-open round-trips as Closed (42)
    // and half-open as Open (46) — the nearest GM voices.
    HiHatQuarter: 42,
    HiHatHalf: 46,
    HiHatPedal: 44,
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
    // why: #1321 — `DISPATCHER_FAMILIES` (synth-drums.ts) emits Agogo/Cowbell
    // variants suffix-first (`AgogoHigh`, `CowbellLow`, ...), the same
    // convention as the Conga/Bongo keys above, but this map only had the
    // legacy space-form Agogo keys and no variant Cowbell keys at all — so a
    // bare `DRUM_MAP[name]` lookup (used by live MIDI-out) missed both and
    // fell through to its Kick fallback. GM has only one cowbell note (56),
    // so both variants land on it, matching the `.mid` exporter's now-removed
    // fuzzy-match comment.
    AgogoHigh: 67,
    AgogoLow: 68,
    CowbellHigh: 56,
    CowbellLow: 56,
    // why: #1321 — Metal's accent-cymbal splash (`grooves/metal.ts`) emits
    // 'China' and this map had no entry at all. Live MIDI-out (soundName-only
    // lookup) fell all the way through to the Kick fallback; the `.mid`
    // exporter (soundName-or-lane-name lookup) fell back to the China hit's
    // Open-lane note instead — wrong instrument on both paths, just
    // differently wrong. 52 is General MIDI's "Chinese Cymbal" — the
    // standard percussion-key-map note for this voice.
    China: 52,
};

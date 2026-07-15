import { useEffect, useRef, useState } from 'preact/hooks';
import { KEY_ORDER } from '../../config.js';
import { spellPitchClass } from '../../engine/note-spelling.js';

/**
 * Tap-a-chord picker. Pops up when a chord cell is tapped in the locked
 * chord-visualizer view and lets the user swap one chord without unlocking
 * the whole chart. Mobile-safe (no keyboard ever appears).
 *
 * Emits the new chord text in the chart's current notation (roman / NNS / name)
 * via `onSelect`. The caller (ChordVisualizer) hands the text off to
 * `replaceChordInSection`, which splices the section's source text at the
 * chord's `charStart` / `charEnd`.
 */

type Notation = 'roman' | 'nns' | 'name';

interface DegreeOption {
    degree: number; // 1..7
    accidental: '' | 'b' | '#';
    label: string; // visual label used inside the button
}

// Diatonic + commonly borrowed roots, ordered to read like a keyboard.
const DEGREES: DegreeOption[] = [
    { degree: 1, accidental: '', label: 'I' },
    { degree: 2, accidental: 'b', label: '♭II' },
    { degree: 2, accidental: '', label: 'II' },
    { degree: 3, accidental: 'b', label: '♭III' },
    { degree: 3, accidental: '', label: 'III' },
    { degree: 4, accidental: '', label: 'IV' },
    { degree: 4, accidental: '#', label: '♯IV' },
    { degree: 5, accidental: '', label: 'V' },
    { degree: 6, accidental: 'b', label: '♭VI' },
    { degree: 6, accidental: '', label: 'VI' },
    { degree: 7, accidental: 'b', label: '♭VII' },
    { degree: 7, accidental: '', label: 'VII' },
];

interface QualityOption {
    id: string;
    label: string;
    // For roman/NNS: lowercase the numeral when the chord is a "minor variant."
    isMinor: boolean;
    // Suffix to append after the root. Roman/NNS share suffix form because
    // lowercase already conveys minor; name-notation uses nameSuffix.
    suffix: string;
    nameSuffix: string;
    title: string;
}

const QUALITIES: QualityOption[] = [
    { id: 'maj', label: 'maj', isMinor: false, suffix: '', nameSuffix: '', title: 'Major' },
    { id: 'min', label: 'min', isMinor: true, suffix: '', nameSuffix: 'm', title: 'Minor' },
    { id: '7', label: '7', isMinor: false, suffix: '7', nameSuffix: '7', title: 'Dominant 7' },
    {
        id: 'maj7',
        label: 'maj7',
        isMinor: false,
        suffix: 'maj7',
        nameSuffix: 'maj7',
        title: 'Major 7',
    },
    { id: 'm7', label: 'm7', isMinor: true, suffix: '7', nameSuffix: 'm7', title: 'Minor 7' },
    {
        id: 'dim',
        label: 'dim',
        isMinor: true,
        suffix: 'dim',
        nameSuffix: 'dim',
        title: 'Diminished',
    },
    {
        id: 'aug',
        label: 'aug',
        isMinor: false,
        suffix: 'aug',
        nameSuffix: 'aug',
        title: 'Augmented',
    },
    {
        id: 'sus4',
        label: 'sus4',
        isMinor: false,
        suffix: 'sus4',
        nameSuffix: 'sus4',
        title: 'Suspended 4',
    },
];

// Semitone offsets from the key tonic for each scale degree, by mode.
const MAJOR_DEGREE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_DEGREE_OFFSETS = [0, 2, 3, 5, 7, 8, 10];

function keyTonicSemitone(keyName: string): number {
    const idx = KEY_ORDER.indexOf(keyName);
    return idx === -1 ? 0 : idx;
}

function buildRomanRoot(degree: number, accidental: string, isMinor: boolean): string {
    const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
    const numeral = numerals[degree - 1] ?? 'I';
    const cased = isMinor ? numeral.toLowerCase() : numeral;
    return `${accidental}${cased}`;
}

function buildNnsRoot(degree: number, accidental: string): string {
    return `${accidental}${degree}`;
}

function buildNameRoot(
    degree: number,
    accidental: string,
    keyName: string,
    keyIsMinor: boolean,
): string {
    const tonic = keyTonicSemitone(keyName);
    const offsets = keyIsMinor ? MINOR_DEGREE_OFFSETS : MAJOR_DEGREE_OFFSETS;
    const base = offsets[degree - 1] ?? 0;
    const accidentalShift = accidental === 'b' ? -1 : accidental === '#' ? 1 : 0;
    const pitchClass = (((tonic + base + accidentalShift) % 12) + 12) % 12;
    // Spell key-aware so the editor matches the rendered chart: a chord picked in
    // a sharp key (E major → G#) spells with sharps, not Ab. An explicit b/# the
    // user dialed in wins over the key context. `keyIsMinor` keeps a flat-minor
    // key (D/G minor) spelling flat instead of inheriting the major sharp set
    // (#845). Display/notation only — pitch is unchanged and a stored `Ab` still
    // parses (#779).
    return spellPitchClass(pitchClass, keyName, accidental, '', keyIsMinor);
}

/**
 * Build the chord text in the active notation. Roman / NNS use case (lowercase)
 * to convey minor; name-notation always emits the pitch in capitals with an `m`
 * suffix to convey minor.
 */
export function buildChordText(
    degree: number,
    accidental: '' | 'b' | '#',
    quality: QualityOption,
    notation: Notation,
    keyName: string,
    keyIsMinor: boolean,
): string {
    if (notation === 'nns') {
        const root = buildNnsRoot(degree, accidental);
        // NNS uses a `-` suffix for minor, then layer the quality suffix on top.
        const minorSuffix = quality.isMinor ? '-' : '';
        return `${root}${minorSuffix}${quality.suffix}`;
    }
    if (notation === 'name') {
        const root = buildNameRoot(degree, accidental, keyName, keyIsMinor);
        return `${root}${quality.nameSuffix}`;
    }
    // roman
    const root = buildRomanRoot(degree, accidental, quality.isMinor);
    return `${root}${quality.suffix}`;
}

interface ChordPickerProps {
    /** Best-guess root degree (1-7) of the chord being replaced; used to highlight. */
    initialDegree: number;
    initialAccidental: '' | 'b' | '#';
    initialQualityId: string;
    notation: Notation;
    keyName: string;
    keyIsMinor: boolean;
    /** Anchor rectangle (in viewport coords) for popover positioning. */
    anchorRect: DOMRect | null;
    onSelect: (newText: string) => void;
    onClose: () => void;
}

export function ChordPicker({
    initialDegree,
    initialAccidental,
    initialQualityId,
    notation,
    keyName,
    keyIsMinor,
    anchorRect,
    onSelect,
    onClose,
}: ChordPickerProps) {
    const [degree, setDegree] = useState(initialDegree);
    const [accidental, setAccidental] = useState<'' | 'b' | '#'>(initialAccidental);
    const [qualityId, setQualityId] = useState(initialQualityId);
    const rootRef = useRef<HTMLDivElement | null>(null);

    // Click-outside dismiss + Escape key.
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        const handleClick = (e: Event) => {
            if (!rootRef.current) {
                return;
            }
            const target = e.target as Node;
            if (!rootRef.current.contains(target)) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKey);
        // why: the mount effect (where the Escape listener attaches) can still be
        // pending when `.chord-picker` first paints — role="dialog" is static JSX,
        // not a post-effect signal, so an e2e test racing straight to Escape can
        // beat the listener (docs/FLAKY_TESTS.md e2e-timing). This attribute is
        // set only once the listener is live, giving tests a real condition to
        // await instead.
        rootRef.current?.setAttribute('data-dismiss-ready', 'true');
        // Defer the click listener to the next tick so the click that *opened*
        // the picker doesn't immediately close it.
        const id = setTimeout(() => {
            document.addEventListener('mousedown', handleClick);
            document.addEventListener('touchstart', handleClick);
        }, 0);
        return () => {
            clearTimeout(id);
            document.removeEventListener('keydown', handleKey);
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('touchstart', handleClick);
        };
    }, [onClose]);

    const quality = QUALITIES.find((q) => q.id === qualityId) || QUALITIES[0];

    const apply = (next: { degree?: number; accidental?: '' | 'b' | '#'; qualityId?: string }) => {
        const nextDegree = next.degree ?? degree;
        const nextAccidental = next.accidental ?? accidental;
        const nextQualityId = next.qualityId ?? qualityId;
        const nextQuality = QUALITIES.find((q) => q.id === nextQualityId) || quality;
        setDegree(nextDegree);
        setAccidental(nextAccidental);
        setQualityId(nextQualityId);
        const text = buildChordText(
            nextDegree,
            nextAccidental,
            nextQuality,
            notation,
            keyName,
            keyIsMinor,
        );
        onSelect(text);
    };

    // Position above/below the anchor with viewport-edge clamping.
    const popoverStyle = (() => {
        if (!anchorRect || typeof window === 'undefined') {
            return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
        }
        const PAD = 8;
        const POPOVER_W = 280;
        const left = Math.min(
            Math.max(PAD, anchorRect.left + anchorRect.width / 2 - POPOVER_W / 2),
            window.innerWidth - POPOVER_W - PAD,
        );
        // Prefer below; fall back above when there's no room.
        const spaceBelow = window.innerHeight - anchorRect.bottom;
        const placeBelow = spaceBelow > 220;
        const top = placeBelow ? anchorRect.bottom + 6 : Math.max(PAD, anchorRect.top - 220);
        return { top: `${top}px`, left: `${left}px` };
    })();

    return (
        <div
            ref={rootRef}
            class="chord-picker"
            role="dialog"
            aria-label="Replace chord"
            style={popoverStyle}
        >
            <div class="chord-picker__row chord-picker__row--roots" role="group" aria-label="Root">
                {DEGREES.map((d) => {
                    const isActive = d.degree === degree && d.accidental === accidental;
                    return (
                        <button
                            type="button"
                            key={`${d.accidental}${d.degree}`}
                            class={`chord-picker__root${isActive ? ' is-active' : ''}`}
                            onClick={() => apply({ degree: d.degree, accidental: d.accidental })}
                        >
                            {d.label}
                        </button>
                    );
                })}
            </div>
            <div
                class="chord-picker__row chord-picker__row--qualities"
                role="group"
                aria-label="Quality"
            >
                {QUALITIES.map((q) => {
                    const isActive = q.id === qualityId;
                    return (
                        <button
                            type="button"
                            key={q.id}
                            class={`chord-picker__quality${isActive ? ' is-active' : ''}`}
                            title={q.title}
                            onClick={() => apply({ qualityId: q.id })}
                        >
                            {q.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

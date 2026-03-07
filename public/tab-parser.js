import { ENHARMONIC_MAP, KEY_ORDER } from './config.js';
import { generateId } from './utils.js';

/**
 * Validates a single chord symbol.
 * Handles roots, complex suffixes (maj7, sus4, add9, etc.), and slash chords.
 */

const CHORD_ROOT_PATTERN = /^[A-G][b#]?/i;
const VOWEL_GROUP_PATTERN = /[aeiouy]+/g;
const PARENTHESES_PATTERN = /[()]/g;
const PIPE_PARENTHESES_PATTERN = /[|()]/g;
const REPEAT_MULTIPLIER_PATTERN = /^x\s*(\d+)$/i;
const CAPO_PATTERN = /capo[:\s]*(\d+)/i;
const CHORD_REGEX =
    /^(?:N\.?C\.?|[A-G][b#]?(?:maj|min|m|dim|aug|sus|add|M|alt)?(?:[0-9]+)?(?:(?:maj|min|m|dim|aug|sus|add|M|alt)?[0-9]*)?(?:[/-][A-G][b#]?(?:maj|min|m|dim|aug|sus|add|M|alt)?[0-9]*|[-+]\d+)?)$/i;
const NON_ALPHA_PATTERN = /[^a-z]/g;

const SECTION_COLORS = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
];

/**
 * Heuristic to detect the key of a song based on its chords.
 * @param {Array} sections - Parsed song sections
 * @returns {Object} { key, isMinor, score, confidence }
 */
export function detectKey(sections) {
    if (!sections || sections.length === 0) {
        return { key: 'C', isMinor: false, confidence: 0 };
    }

    const allChords = [];
    sections.forEach((s) => {
        const parts = s.value.split(' | ');
        for (let i = 0; i < s.repeat; i++) {
            parts.forEach((p, idx) => {
                const isFirst = idx === 0 && i === 0 && sections.indexOf(s) === 0;
                const isLast =
                    idx === parts.length - 1 &&
                    i === s.repeat - 1 &&
                    sections.indexOf(s) === sections.length - 1;
                allChords.push({ chord: p, weight: isFirst ? 3 : isLast ? 2 : 1 });
            });
        }
    });

    if (allChords.length === 0) {
        return { key: 'C', isMinor: false, confidence: 0 };
    }

    const scores = [];

    // Scoring logic
    KEY_ORDER.forEach((root) => {
        [false, true].forEach((isMinor) => {
            let score = 0;
            const rootIndex = KEY_ORDER.indexOf(root);

            // Diatonic Sets (0-indexed semitones from root)
            // Major: I, ii, iii, IV, V, vi, vii°
            // Minor: i, ii°, III, iv, v, VI, VII
            const diatonicOffsets = isMinor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];

            allChords.forEach(({ chord, weight }) => {
                const chordRoot = chord.match(CHORD_ROOT_PATTERN)?.[0];
                if (!chordRoot) {
                    return;
                }
                const rootName = chordRoot.toUpperCase();
                const normalizedRoot = ENHARMONIC_MAP[rootName] || rootName;
                const chordIndex = KEY_ORDER.indexOf(normalizedRoot);
                const offset = (chordIndex - rootIndex + 12) % 12;

                const isChordMinor =
                    chord.toLowerCase().includes('m') && !chord.toLowerCase().includes('maj');

                // Check if chord fits diatonic scale
                if (diatonicOffsets.includes(offset)) {
                    score += weight;

                    // Quality Match Bonus
                    // In Major: I, IV, V are Major. ii, iii, vi are Minor.
                    // In Minor: i, iv, v are Minor. III, VI, VII are Major.
                    const expectedMinorOffsets = isMinor ? [0, 5, 7] : [2, 4, 9];
                    if (isChordMinor === expectedMinorOffsets.includes(offset)) {
                        score += weight * 0.5;
                    }
                }

                // Tonic Bonus
                if (offset === 0) {
                    score += weight * 0.5;
                    // If the tonic matches quality, big bonus
                    if (isChordMinor === isMinor) {
                        score += weight * 1.0;
                    }
                }
            });

            // Cadence Bonus (V -> I)
            for (let i = 0; i < allChords.length - 1; i++) {
                const c1 = allChords[i].chord.match(CHORD_ROOT_PATTERN)?.[0];
                const c2 = allChords[i + 1].chord.match(CHORD_ROOT_PATTERN)?.[0];
                if (!c1 || !c2) {
                    continue;
                }
                const n1 = ENHARMONIC_MAP[c1.toUpperCase()] || c1.toUpperCase();
                const n2 = ENHARMONIC_MAP[c2.toUpperCase()] || c2.toUpperCase();
                const o1 = (KEY_ORDER.indexOf(n1) - rootIndex + 12) % 12;
                const o2 = (KEY_ORDER.indexOf(n2) - rootIndex + 12) % 12;

                if (o1 === 7 && o2 === 0) {
                    score += 2; // Strong V-I or V-i cadence
                }
            }

            scores.push({ key: root, isMinor, score });
        });
    });

    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];
    const totalPossible = allChords.reduce((acc, curr) => acc + curr.weight, 0);
    const confidence = best.score / (totalPossible + 1);

    return { ...best, confidence };
}

/**
 * Checks if a line is likely a "measure grid" line like | / / / / |
 */
function isMeasureGrid(line) {
    const hasSlashesOrDots = line.includes('/') || line.includes('..');
    const hasChordTokens = /[A-G%]/.test(line);
    return hasSlashesOrDots && !hasChordTokens;
}

/**
 * Attempts to extract a section header from a line.
 */
function getSectionHeader(line) {
    // [Chorus]
    const bracketMatch = line.match(/^\[(.*)\]$/);
    if (bracketMatch) {
        return bracketMatch[1];
    }

    // #1. or # Verse
    const numMatch = line.match(/^#\s*(\d+\.?|.*)$/);
    if (numMatch) {
        return numMatch[1];
    }

    // INTRO: or VERSE 1:
    const colonMatch = line.match(/^([A-Z\s]+[0-9]*):/);
    if (colonMatch) {
        return colonMatch[1];
    }

    return null;
}

/**
 * Counts syllables in a line of text by identifying vowel groups.
 * @param {string} text
 * @returns {number}
 */
export function countSyllables(text) {
    if (!text) {
        return 0;
    }
    // Optimization: Replace inline regex with module constant to avoid recompilation overhead
    const clean = text.toLowerCase().replace(NON_ALPHA_PATTERN, ' ');
    const tokens = clean.split(/\s+/).filter((t) => t.length > 0);
    let count = 0;

    for (const token of tokens) {
        // Basic vowel group counting: [aeiouy]+
        const matches = token.match(VOWEL_GROUP_PATTERN);
        if (matches) {
            count += matches.length;
            // Adjustment for silent 'e' at the end of words (e.g., "skate", "those")
            if (token.length > 3 && token.endsWith('e') && !token.endsWith('le')) {
                // If it ends in 'e' and has other vowel groups, subtract one.
                if (matches.length > 1) {
                    count--;
                }
            }
        }
    }
    return count;
}

/**
 * Parses a raw chord chart text.
 * @param {string} text
 * @returns {Object} { sections: Array, capo: number }
 */
export function parseTab(text) {
    const lines = text.split('\n');
    const sections = [];
    let currentSection = null;
    let capo = 0;

    const flushCurrentSection = () => {
        if (currentSection && currentSection.measures.length > 0) {
            sections.push({
                id: generateId(),
                label: currentSection.label || 'Import',
                value: currentSection.measures.map((m) => m.chord).join(' | '),
                syllables: currentSection.measures.map((m) => m.syllables),
                repeat: currentSection.repeat || 1,
                color: '#3b82f6',
            });
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') {
            continue;
        }

        // 1. Check for Section Header
        const headerMatch = getSectionHeader(line);
        if (headerMatch) {
            flushCurrentSection();
            currentSection = {
                label: headerMatch.trim(),
                measures: [],
                repeat: 1,
            };

            // If it's a colon-style header, check for inline chords
            if (line.includes(':')) {
                const restOfLine = line.split(':')[1].trim();
                if (restOfLine) {
                    // Process this partial line as a chord line
                    processLine(restOfLine, i);
                }
            }
            continue;
        }

        // 2. Detect Key Changes
        if (line.toLowerCase().includes('key change') || line.toLowerCase().includes('transpose')) {
            // Future improvement
        }

        // 3. Skip measure grids | / / / / | but use them as a "spacer" hint
        if (isMeasureGrid(line) && !line.includes(':')) {
            continue;
        }

        // 4. Identify Chord Lines vs Lyric Lines
        processLine(line, i);
    }

    function processLine(line, lineIndex) {
        if (!currentSection) {
            currentSection = { label: 'Import', measures: [], repeat: 1 };
        }

        // --- A. Pipe-Aware Parsing (Standard Tab Format) ---
        if (line.includes('|')) {
            const bars = line.split('|').map((b) => b.trim());
            // Filter out empty bars at start/end of line
            const validBars = bars.filter((b, idx) => {
                if (b === '' && (idx === 0 || idx === bars.length - 1)) {
                    return false;
                }
                return true;
            });

            if (validBars.length > 0) {
                let foundChords = false;
                const newMeasures = [];

                validBars.forEach((bar) => {
                    const tokens = bar.split(/\s+/).filter((t) => t.length > 0);
                    const barChords = [];
                    let repeatBar = false;

                    tokens.forEach((t) => {
                        const clean = t.replace(PARENTHESES_PATTERN, '');
                        if (clean === '%') {
                            repeatBar = true;
                        } else if (CHORD_REGEX.test(clean)) {
                            barChords.push(clean === 'N.C.' ? 'R' : clean);
                        }
                    });

                    if (barChords.length > 0 || repeatBar) {
                        foundChords = true;
                        if (repeatBar) {
                            const last =
                                newMeasures[newMeasures.length - 1] ||
                                currentSection.measures[currentSection.measures.length - 1];
                            if (last) {
                                newMeasures.push({ ...last });
                            }
                        } else {
                            // Join multiple chords in one bar with spaces
                            newMeasures.push({
                                chord: barChords.join(' '),
                                syllables: 0, // will calculate later
                            });
                        }
                    }
                });

                if (foundChords) {
                    // Calculate syllables for the whole line
                    const lyricLine = lookAheadForLyrics(lineIndex);
                    const totalSyllables = countSyllables(lyricLine);
                    const syllablesPerBar = Math.ceil(totalSyllables / newMeasures.length);
                    newMeasures.forEach((m) => {
                        m.syllables = syllablesPerBar;
                        currentSection.measures.push(m);
                    });
                    return;
                }
            }
        }

        // --- B. Traditional Free-Text Parsing ---
        const tokens = line.split(/[\s,.]+/).filter((t) => t.length > 0);
        let chordCount = 0;
        let repeatValue = 1;

        const possibleChords = tokens.filter((t) => {
            const clean = t.replace(PIPE_PARENTHESES_PATTERN, '');
            if (clean === '') {
                return false;
            }
            if (CHORD_REGEX.test(clean) || clean === '%') {
                chordCount++;
                return true;
            }
            const repeatMatch = clean.match(REPEAT_MULTIPLIER_PATTERN);
            if (repeatMatch) {
                repeatValue = parseInt(repeatMatch[1], 10);
                return false;
            }
            return false;
        });

        const isChordLine = chordCount > 0 && (chordCount / tokens.length > 0.4 || chordCount > 3);

        if (isChordLine) {
            const cleanTokens = possibleChords.map((c) => c.replace(PIPE_PARENTHESES_PATTERN, ''));
            const lyricLine = lookAheadForLyrics(lineIndex);
            const totalSyllables = countSyllables(lyricLine);
            const syllablesPerMeasure =
                cleanTokens.length > 0 ? Math.ceil(totalSyllables / cleanTokens.length) : 0;

            cleanTokens.forEach((token) => {
                if (token === '%') {
                    const last = currentSection.measures[currentSection.measures.length - 1];
                    if (last) {
                        currentSection.measures.push({ ...last });
                    }
                } else {
                    currentSection.measures.push({
                        chord: token === 'N.C.' ? 'R' : token,
                        syllables: syllablesPerMeasure,
                    });
                }
            });

            if (repeatValue > 1) {
                currentSection.repeat = repeatValue;
            }
        } else {
            // Check for metadata like Capo
            const lower = line.toLowerCase();
            if (lower.includes('capo')) {
                const match = line.match(CAPO_PATTERN);
                if (match) {
                    capo = parseInt(match[1], 10);
                }
            }
        }
    }

    function lookAheadForLyrics(lineIndex) {
        for (let j = lineIndex + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim();
            if (nextLine === '' || isMeasureGrid(nextLine)) {
                continue;
            }
            if (getSectionHeader(nextLine)) {
                break;
            }

            const nextTokens = nextLine.split(/[\s,.]+/).filter((t) => t.length > 0);
            const nextChordCount = nextTokens.filter((t) => {
                const clean = t.replace(PIPE_PARENTHESES_PATTERN, '');
                return clean !== '' && (CHORD_REGEX.test(clean) || clean === '%');
            }).length;

            const isNextChordLine =
                nextChordCount > 0 &&
                (nextChordCount / nextTokens.length > 0.4 || nextChordCount > 3);

            if (!isNextChordLine) {
                return nextLine;
            }
            break;
        }
        return '';
    }

    flushCurrentSection();

    // 5. Cleanup empty leading section (often just metadata)
    if (sections.length > 0 && sections[0].value.trim() === '') {
        sections.shift();
    }

    // 6. Assign Colors
    sections.forEach((s, i) => {
        s.color = SECTION_COLORS[i % SECTION_COLORS.length];
    });

    return { sections, capo };
}

import { describe, expect, it } from 'vitest';
import { decodeChartDocument } from '../../../public/songbook/codec.js';
import {
    inspectSongbookStructure,
    SONGBOOK_MAX_DEPTH,
    SONGBOOK_MAX_INPUT_BYTES,
    SONGBOOK_MAX_VISITED_NODES,
} from '../../../public/songbook/structural-limits.js';

function nestedValue(depth: number): unknown {
    let value: unknown = 0;
    for (let index = 0; index < depth; index++) {
        value = { child: value };
    }
    return value;
}

describe('Songbook structural ceilings (#1044)', () => {
    it('accepts depth 32 and rejects depth 33', () => {
        expect(inspectSongbookStructure(nestedValue(SONGBOOK_MAX_DEPTH))).toEqual({
            kind: 'ok',
            value: { nodes: SONGBOOK_MAX_DEPTH + 1, maxDepth: SONGBOOK_MAX_DEPTH },
        });
        expect(inspectSongbookStructure(nestedValue(SONGBOOK_MAX_DEPTH + 1))).toEqual({
            kind: 'invalid',
            issue: expect.objectContaining({ code: 'structure-too-deep' }),
        });
    });

    it('accepts 100,000 visited nodes and rejects node 100,001', () => {
        const atLimit = new Array(SONGBOOK_MAX_VISITED_NODES - 1).fill(0);
        expect(inspectSongbookStructure(atLimit)).toEqual({
            kind: 'ok',
            value: { nodes: SONGBOOK_MAX_VISITED_NODES, maxDepth: 1 },
        });

        const overLimit = new Array(SONGBOOK_MAX_VISITED_NODES).fill(0);
        expect(inspectSongbookStructure(overLimit)).toEqual({
            kind: 'invalid',
            issue: expect.objectContaining({ code: 'structure-too-large' }),
        });
    });

    it('accepts exactly 1 MiB before parsing and rejects one UTF-8 byte more', () => {
        const atLimit = ' '.repeat(SONGBOOK_MAX_INPUT_BYTES);
        expect(decodeChartDocument(atLimit)).toEqual({
            kind: 'invalid',
            issues: [expect.objectContaining({ code: 'invalid-json' })],
        });

        const overLimit = `${atLimit} `;
        expect(decodeChartDocument(overLimit)).toEqual({
            kind: 'invalid',
            issues: [expect.objectContaining({ code: 'input-too-large' })],
        });
    });

    it('rejects cyclic and non-JSON object inputs before schema validation', () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        expect(inspectSongbookStructure(cyclic)).toEqual({
            kind: 'invalid',
            issue: expect.objectContaining({ code: 'cyclic-input' }),
        });
        expect(inspectSongbookStructure({ when: new Date() })).toEqual({
            kind: 'invalid',
            issue: expect.objectContaining({ code: 'invalid-type', path: '$.when' }),
        });
    });

    it('rejects sparse arrays and accessor properties without evaluating or throwing', () => {
        expect(() => inspectSongbookStructure(new Array(1))).not.toThrow();
        expect(inspectSongbookStructure(new Array(1))).toEqual({
            kind: 'invalid',
            issue: expect.objectContaining({ code: 'invalid-type', path: '$.0' }),
        });

        let getterRead = false;
        const accessorCandidate = Object.defineProperty({}, 'value', {
            enumerable: true,
            get() {
                getterRead = true;
                throw new Error('must not run');
            },
        });
        expect(() => inspectSongbookStructure(accessorCandidate)).not.toThrow();
        expect(inspectSongbookStructure(accessorCandidate)).toEqual({
            kind: 'invalid',
            issue: expect.objectContaining({ code: 'invalid-type', path: '$.value' }),
        });
        expect(getterRead).toBe(false);
    });

    it('reads proxy array length metadata without invoking value traps', () => {
        const candidate = new Proxy([], {
            get(target, property, receiver) {
                if (property === 'length') {
                    throw new Error('length trap');
                }
                return Reflect.get(target, property, receiver);
            },
        });

        expect(() => inspectSongbookStructure(candidate)).not.toThrow();
        expect(inspectSongbookStructure(candidate)).toEqual({
            kind: 'ok',
            value: { nodes: 1, maxDepth: 0 },
        });
    });

    it('contains proxy array length reflection failures as typed invalid input', () => {
        const candidate = new Proxy([], {
            getOwnPropertyDescriptor(target, property) {
                if (property === 'length') {
                    throw new Error('length descriptor trap');
                }
                return Reflect.getOwnPropertyDescriptor(target, property);
            },
        });

        expect(() => inspectSongbookStructure(candidate)).not.toThrow();
        expect(inspectSongbookStructure(candidate)).toEqual({
            kind: 'invalid',
            issue: expect.objectContaining({ code: 'invalid-type', path: '$' }),
        });
    });
});

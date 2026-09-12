import { describe, expect, it } from 'vitest';
import {
    digest,
    identifier,
    type PreparedSave,
    reply,
    snapshot,
} from '../../../prototypes/v2/lib/sync/protocol.js';
import { accountChart } from '../../utils/account-songbook-fixture.js';

describe('Save protocol document boundary', () => {
    it('preserves v2 semantic content and private import source without introducing sync metadata', () => {
        const legacy = accountChart();
        const v2 = {
            ...legacy,
            schemaVersion: 2,
            importSource: { format: 'irealb', text: '<html>synthetic private source</html>' },
            chart: {
                performance: legacy.chart.performance,
                band: legacy.chart.band,
                score: {
                    key: 'C',
                    isMinor: false,
                    meter: '4/4',
                    grouping: null,
                    notation: 'name',
                    sections: [
                        {
                            id: 'a',
                            label: 'A',
                            repeat: 1,
                            measures: [
                                {
                                    id: 'm1',
                                    content: {
                                        kind: 'events',
                                        events: [{ kind: 'chord', symbol: 'C7', duration: [4, 1] }],
                                    },
                                },
                            ],
                        },
                    ],
                },
            },
        };
        const copy = snapshot(v2);
        expect(copy).toEqual(v2);
        v2.title = 'changed after Save';
        expect(copy.title).toBe('A');
        expect(copy).not.toHaveProperty('ownerId');
    });

    it.each(['', '../owner', 'a/b', 'a b', 'x'.repeat(129), null, 42])(
        'rejects invalid scope IDs: %s',
        (id) => {
            expect(() => identifier(id)).toThrow('identifier');
        },
    );

    it('uses standard SHA-256 rather than an unstable object hash', async () => {
        expect(await digest('abc')).toBe(
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        );
    });

    it('copies only bound receipt fields, never extra private transport data', () => {
        const request: PreparedSave = {
            ownerId: 'a',
            documentId: 'song',
            operationId: 'op',
            body: '{}',
            digest: 'a'.repeat(64),
        };
        expect(
            reply(
                { ...request, kind: 'committed', revision: 'epoch-1:r1', secret: 'not stored' },
                request,
            ),
        ).toEqual({
            kind: 'committed',
            ownerId: 'a',
            documentId: 'song',
            operationId: 'op',
            digest: request.digest,
            revision: 'epoch-1:r1',
        });
    });
});

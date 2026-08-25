import { describe, expect, it } from 'vitest';
import { getInitialJavaScriptPaths } from '../../scripts/initial-js-assets.js';

describe('getInitialJavaScriptPaths', () => {
    it('measures the entry and static preload graph without lazy chunks', () => {
        const html = `
            <link rel="stylesheet" href="/index.rev.css">
            <link crossorigin href="/chunk-shared.js" rel="modulepreload">
            <script type="module" crossorigin src="/index.rev.js"></script>
            <link rel="modulepreload" href="/chunk-shared.js">
            <link rel="prefetch" href="/chunk-lazy.js">
        `;

        expect(getInitialJavaScriptPaths(html)).toEqual([
            'dist/index.rev.js',
            'dist/chunk-shared.js',
        ]);
        expect(getInitialJavaScriptPaths(html)).not.toContain('dist/chunk-lazy.js');
    });

    it('fails closed when the build has no entry script', () => {
        expect(() =>
            getInitialJavaScriptPaths('<link rel="modulepreload" href="/chunk-orphan.js">'),
        ).toThrow('no initial script asset');
    });

    it('matches complete attribute names instead of data-attribute suffixes', () => {
        expect(
            getInitialJavaScriptPaths(
                '<script data-src="/chunk-lazy.js" src="/index.rev.js"></script>',
            ),
        ).toEqual(['dist/index.rev.js']);
    });

    it('fails closed when a module preload has no usable href', () => {
        const entry = '<script src="/index.rev.js"></script>';

        expect(() => getInitialJavaScriptPaths(`${entry}<link rel="modulepreload">`)).toThrow(
            'non-empty href',
        );
        expect(() =>
            getInitialJavaScriptPaths(`${entry}<link rel="modulepreload" href="">`),
        ).toThrow('non-empty href');
    });

    it('rejects non-local and traversal references', () => {
        expect(() =>
            getInitialJavaScriptPaths('<script src="https://cdn.example/app.js"></script>'),
        ).toThrow('must be root-relative');
        expect(() => getInitialJavaScriptPaths('<script src="/../app.js"></script>')).toThrow(
            'not a safe built asset',
        );
    });
});

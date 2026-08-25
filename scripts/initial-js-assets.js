function getAttribute(tag, name) {
    return tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] ?? null;
}

function toDistPath(reference) {
    if (!reference.startsWith('/') || reference.startsWith('//')) {
        throw new Error(`Initial JavaScript reference must be root-relative: ${reference}`);
    }

    const relativePath = reference.slice(1);
    const segments = relativePath.split('/');
    if (
        segments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
        !/^[a-zA-Z0-9_./-]+\.js$/.test(relativePath)
    ) {
        throw new Error(`Initial JavaScript reference is not a safe built asset: ${reference}`);
    }
    return `dist/${relativePath}`;
}

/**
 * Return the local JavaScript Vite asks the browser to fetch at first load:
 * entry scripts first, then their modulepreload graph. Dynamic chunks are absent
 * from index.html and therefore deliberately excluded.
 */
export function getInitialJavaScriptPaths(html) {
    if (typeof html !== 'string') {
        throw new TypeError('Built index HTML must be a string.');
    }

    const entries = [];
    const preloads = [];
    for (const match of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
        const [, kind] = match;
        const tag = match[0];
        if (kind.toLowerCase() === 'script') {
            const source = getAttribute(tag, 'src');
            if (source) {
                entries.push(toDistPath(source));
            }
            continue;
        }

        const rel = getAttribute(tag, 'rel');
        const href = getAttribute(tag, 'href');
        if (rel?.toLowerCase().split(/\s+/).includes('modulepreload')) {
            if (!href) {
                throw new Error('A modulepreload link must have a non-empty href.');
            }
            preloads.push(toDistPath(href));
        }
    }

    if (entries.length === 0) {
        throw new Error('Built index HTML contains no initial script asset.');
    }
    return [...new Set([...entries, ...preloads])];
}

/**
 * A minimal same-origin cookie jar for exercising `app.request()` across multiple calls in a
 * test, standing in for what a browser does automatically. Uses `Headers#getSetCookie()` (not
 * a naive `headers.get('set-cookie')` join+split) because multiple `Set-Cookie` headers on one
 * response cannot be safely joined by `,` — a cookie's own `Expires` attribute contains a comma.
 */
export interface CookieJar {
    /** Records every `Set-Cookie` on a response, applying deletions (`Max-Age=0`) too. */
    ingest(response: Response): void;
    /** The `Cookie` request header value for every cookie currently held, or `undefined` if none. */
    header(): string | undefined;
    /** Current value of one cookie by name, or `undefined` if not held. */
    get(name: string): string | undefined;
}

export function createCookieJar(): CookieJar {
    const cookies = new Map<string, string>();

    return {
        ingest(response: Response): void {
            for (const setCookie of response.headers.getSetCookie()) {
                const [pair] = setCookie.split(';');
                const eqIndex = pair.indexOf('=');
                if (eqIndex === -1) {
                    continue;
                }
                const name = pair.slice(0, eqIndex).trim();
                const value = pair.slice(eqIndex + 1).trim();
                if (/max-age=0\b/i.test(setCookie)) {
                    cookies.delete(name);
                } else {
                    cookies.set(name, value);
                }
            }
        },
        header(): string | undefined {
            if (cookies.size === 0) {
                return undefined;
            }
            return Array.from(cookies.entries())
                .map(([name, value]) => `${name}=${value}`)
                .join('; ');
        },
        get(name: string): string | undefined {
            return cookies.get(name);
        },
    };
}

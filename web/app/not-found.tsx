/**
 * The app's not-found page: the exported `/404.html`, and what `notFound()` renders — the admin
 * page uses it for anyone the server refuses (#1717). Next's built-in one carries an inline
 * `<style>`, which this export's CSP (`scripts/offline.mjs`) blocks, so the app has its own.
 */
export default function NotFound() {
    return (
        <main className="loading">
            <h1>Page not found</h1>
            <p>
                <a href="/">Back to the songbook</a>
            </p>
        </main>
    );
}

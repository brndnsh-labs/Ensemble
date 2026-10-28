import * as repository from './repository';
import type { ChartDocument } from './runtime';

/**
 * Save text to a file on this device: a Blob URL clicked through an anchor, revoked once the
 * browser has had its second to start the download. `band-export.ts`'s `downloadExportResult` is
 * the Blob-in-hand variant for rendered audio; this one takes the text.
 */
export function downloadFile(contents: string, name: string, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/**
 * Write one chart to a file on this device. Extracted from `exportSong` for #1269's sign-out
 * preflight, which exports songs from the LIBRARY rather than the stand — the header (and its
 * account chip, the way to Sign out) is hidden while a chart is open, so at that moment there
 * is no chart on the stand to export and the work at risk is named by document id.
 *
 * `onExportAccountSongs`'s export-everything offer (#1271) and the sign-out preflight's own
 * export both call this once per song in a plain loop, one user gesture triggering several
 * downloads. Chromium allows a handful of same-gesture downloads through without prompting,
 * which is what the checks assert (`*.chromium.spec.ts`); Safari and Firefox are known to
 * prompt before the second download or drop later ones silently past their own per-gesture
 * cap. There is no E2E coverage for either engine here — WebKit/Firefox-specific handling
 * (batching into one archive, or a click-through per file) is unverified and out of scope.
 */
export function exportDocument(candidate: ChartDocument) {
    downloadFile(
        JSON.stringify(repository.validated(candidate), null, 2),
        `${candidate.title.replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 80) || 'chart'}.ensemble`,
    );
}
/**
 * A song row this build cannot read (a text chart, retired in #1740, or a corrupt row), written
 * out as it is stored before a sign-out or account deletion removes it: no build will open the
 * file, but the bytes are the musician's and nothing else here keeps them.
 */
export function exportUnreadable(row: { documentId: string; raw: string }) {
    downloadFile(row.raw, `${row.documentId.slice(0, 80)} (unreadable).json`);
}

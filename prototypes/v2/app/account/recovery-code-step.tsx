'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { AccountFailure } from '../../lib/account/messages';
import { AccountFailureNotice } from './account-failure';

/**
 * "Here is your recovery code — keep it, then confirm you kept it." (#1262, extracted for #1263.)
 *
 * Every flow that mints a code ends here and must end here IDENTICALLY: creating an account
 * (`sign-in.tsx`), recovering one (`recover.tsx`), and replacing a live one from the account page
 * (`account-page.tsx`, #1264). The heading and the sentence above the code differ, because what
 * just happened differs; everything that makes this step trustworthy — the code is displayed and
 * nowhere else, Copy, Download, the "I've saved it" gate on Finish, the touch-reachable
 * "Not now", and the no-email-reset warning underneath — is this component, once.
 *
 * The code lives ONLY in the caller's state for the life of the dialog and in this component's
 * props. It is never written to `localStorage`, `sessionStorage` or IndexedDB, never placed in
 * the URL, never logged, never put in an error message and never parked in a `data-*` or `title`
 * attribute — the text node below and the Blob the Download button builds are the only two places
 * it appears, and the Blob URL is revoked immediately.
 *
 * Unmounting is the reset: the caller clears its `code` when the dialog closes, which takes this
 * component (and the "I've saved it" checkbox, and any copy hint) with it. There is deliberately
 * no clear-on-close effect here to forget to run.
 */

interface RecoveryCodeStepProps {
    /**
     * The id the heading carries, so it is also the enclosing dialog's accessible name. Defaults
     * to the sign-in/recover dialog's; the account page passes its own because BOTH dialogs are
     * mounted at once (`ensemble.tsx`), and two elements sharing one `id` would make each
     * `aria-labelledby` resolve to whichever came first in the document rather than its own.
     */
    headingId?: string;
    /** The heading text itself. */
    heading: string;
    /** What just happened and what this code is for. One paragraph, above the code. */
    lead: ReactNode;
    code: string;
    busy: boolean;
    failure: AccountFailure | null;
    /** Confirm the code was kept. Only after this does the account read as protected. */
    onFinish: () => void;
    /** Abandon: the account is real either way, and the header says it is unprotected. */
    onClose: () => void;
}

export function RecoveryCodeStep({
    headingId = 'account-dialog-title',
    heading,
    lead,
    code,
    busy,
    failure,
    onFinish,
    onClose,
}: RecoveryCodeStepProps) {
    const [savedCode, setSavedCode] = useState(false);
    const [copyHint, setCopyHint] = useState('');

    /**
     * The button that got us here (Create account, Continue, Get a code) unmounts the instant this
     * step replaces it, so focus would otherwise fall back to `<body>` — outside the dialog and
     * silent for a screen reader. Move it to this step's own heading on mount.
     */
    const headingRef = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        headingRef.current?.focus();
    }, []);

    async function copyCode() {
        setCopyHint('');
        try {
            await navigator.clipboard.writeText(code);
            setCopyHint('Copied.');
        } catch {
            // No clipboard permission (the Playwright WebKit project, a locked-down profile):
            // say so instead of failing silently. The code is already selectable in one click.
            setCopyHint('Copy isn’t available here — select the code above and copy it by hand.');
        }
    }

    function downloadCode() {
        // A Blob URL is the only way to hand over a file, and it is revoked on the next tick —
        // it is never navigated to, so the code never appears in the address bar or history.
        const note = `${code}\n\nEnsemble recovery code — the only way back into your account if you lose your passkey. Keep it somewhere safe and private.\n`;
        const url = URL.createObjectURL(new Blob([note], { type: 'text/plain;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'ensemble-recovery-code.txt';
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return (
        <>
            <h2 id={headingId} ref={headingRef} tabIndex={-1}>
                {heading}
            </h2>
            <p>{lead}</p>
            <p className="recovery-code" data-testid="recovery-code">
                {code}
            </p>
            <div className="dialog-actions">
                <button className="btn" onClick={() => void copyCode()}>
                    Copy
                </button>
                <button className="btn" onClick={downloadCode}>
                    Download
                </button>
            </div>
            {copyHint !== '' && <p className="status-detail">{copyHint}</p>}
            <AccountFailureNotice failure={failure} />
            <label className="recovery-confirm">
                <input
                    type="checkbox"
                    checked={savedCode}
                    data-testid="recovery-saved"
                    onChange={(event) => setSavedCode(event.currentTarget.checked)}
                />
                I’ve saved this code somewhere safe
            </label>
            <div className="dialog-actions">
                <button
                    className="btn primary"
                    data-testid="recovery-finish"
                    disabled={!savedCode || busy}
                    onClick={onFinish}
                >
                    Finish
                </button>
                <button
                    className="btn"
                    data-testid="recovery-not-now"
                    disabled={busy}
                    onClick={onClose}
                >
                    Not now
                </button>
            </div>
            <p className="status-detail">
                There’s no email reset and no support override. Lose every passkey and this code,
                and the account can’t be recovered — songs already on this device stay exportable
                either way. Adding a second passkey later is the cheapest insurance.
            </p>
        </>
    );
}

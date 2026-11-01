import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';

/** A stand message's tone: `'warning'` keeps its close button, `'info'` auto-dismisses. */
type MessageTone = 'info' | 'warning';

/** What the shell hands `useStandToast`. */
interface StandToastOptions {
    /** The shell is running an action: the toast says so once it has held (`showBusy`). */
    busy: boolean;
    /** What a sound download is doing, said in place of "Updating…" while busy. */
    soundProgress: string;
    /** The stand's sync-failure notice's fact (`syncFailureNotice`'s `key`), or null for none. */
    standSyncFailureKey: string | null;
    /** "tap anywhere to play" while an `?autoplay=1` link is armed, else null. */
    pendingAutoplayHint: string | null;
    /** Another tab installed the update and this one waits (#1889), else null. */
    updateHint: string | null;
}

/** What the shell's call sites and the `StandStack` markup (`app/stand-stack.tsx`) read back. */
interface StandToast {
    /** Says a sentence on the stand; an `info` one never replaces an undismissed `warning`. */
    setMessage: (text: string, options?: { tone?: MessageTone }) => void;
    /** The toast's close button: clears the message and its tone. */
    dismissMessage: () => void;
    /** The toast's tone, busy outranking a message. */
    toastTone: 'busy' | 'warning' | 'info';
    /** What the toast says, or null when it has nothing to show. */
    toastText: string | null;
    /**
     * Says a sentence to a screen reader only (#1985): it lands inside the toast's own live
     * region, visually hidden, so it is read without a banner covering the chart.
     */
    announce: (text: string) => void;
    /** What `announce` last said, and a token that remounts its node so a repeat is read again. */
    announcement: { text: string; token: number };
    /** One per `setMessage` call: the toast's text is keyed on it, so a repeat is announced. */
    messageToken: number;
    /** Holds the auto-dismiss clock: the toast has the pointer or focus. */
    setToastHeld: Dispatch<SetStateAction<boolean>>;
    /** The sync-failure notice shows: there is one, and it is not the fact last dismissed. */
    standSyncFailureVisible: boolean;
    /** The notice's close button: silences this fact until it moves on. */
    dismissSyncFailure: () => void;
}

/**
 * The stand's message toast (#1460): the message and its tone, the busy line's debounce, the
 * sync-failure notice's dismissal, and the auto-dismiss clock. The shell keeps what each hint
 * says and the notice itself (`syncFailureNotice`). Call it right after `offline`
 * (`useOfflineInstall`), the last input `syncStatusProps` reads, and before `useRowMenu` and
 * `useSongDeletes`, whose handlers say their sentences through `setMessage` (#1930); its effects
 * set only its own state, so running them earlier changes nothing. Every `setMessage` caller
 * above it runs from an event or an effect, never during render.
 */
export function useStandToast({
    busy,
    soundProgress,
    standSyncFailureKey,
    pendingAutoplayHint,
    updateHint,
}: StandToastOptions): StandToast {
    // #1460 — the stand's toast replaced the footer's single-slot status line. `messageToken`
    // exists only so the auto-dismiss effect below can tell "the same sentence, set again" from
    // "still the sentence from four seconds ago": two Saves in a row often produce the exact same
    // text, and a dependency on `message` alone would not re-arm the timer for the second one.
    // `setMessage` is a plain function, not the raw state setter, so every one of the shell's
    // existing call sites keeps working unchanged; a `tone` of `'warning'` (review P2 #3) is for
    // a sentence that needs deliberate reading or action — it persists with its own close button
    // instead of auto-dismissing.
    const [message, setMessageState] = useState('');
    const [messageTone, setMessageToneState] = useState<MessageTone>('info');
    const [messageToken, setMessageToken] = useState(0);
    const [announcement, setAnnouncement] = useState({ text: '', token: 0 });
    function announce(text: string) {
        setAnnouncement((previous) => ({ text, token: previous.token + 1 }));
    }
    // Re-review P3 — a REF, not the `messageTone` state value, because an async caller (one that
    // sets its message from inside a promise chain) closes over whatever `messageTone` was when
    // IT started, which can be stale by the time it resolves. The ref is always current at call
    // time, which is what the guard below needs.
    const messageToneRef = useRef<MessageTone>('info');
    function setMessage(text: string, options?: { tone?: MessageTone }) {
        const tone = options?.tone ?? 'info';
        // Re-review P3 — a transient `info` message must not silently replace an undismissed
        // `warning`: the rename flow's own warning ("This song has unsaved changes…") was getting
        // overwritten moments later by an async path's plain `info` (the draft-retention toast
        // then, retired in #1760). A `warning` can still replace another `warning` (a newer one
        // supersedes); only an `info` call is held off. The close button (`dismissMessage`) is the
        // one place `messageTone` resets afterward — a dismissed warning must not go on blocking
        // every `info` forever.
        if (messageToneRef.current === 'warning' && tone === 'info') {
            return;
        }
        messageToneRef.current = tone;
        setMessageToken((token) => token + 1);
        setMessageState(text);
        setMessageToneState(tone);
    }
    /** The toast's own close button — the one path that clears a `warning`, since `setMessage`'s
     * guard above refuses to let a plain `info` call do it. Resets the tone too, or a dismissed
     * warning would go on blocking every `info` message for the rest of the session. */
    function dismissMessage() {
        messageToneRef.current = 'info';
        setMessageState('');
        setMessageToneState('info');
    }
    // Review P2 #1/#5 — the auto-dismiss timer is paused while the toast has the pointer or
    // focus, so a musician reading (or about to click the close button on) a message it would
    // otherwise clear out from under them gets the time back.
    const [toastHeld, setToastHeld] = useState(false);
    const [dismissedSyncFailureKey, setDismissedSyncFailureKey] = useState<string | null>(null);
    const standSyncFailureVisible =
        standSyncFailureKey !== null && standSyncFailureKey !== dismissedSyncFailureKey;
    // Review P3 — clears the dismissal the moment the VISIBLE fact moves on from it, not only
    // when it goes null: without this, a fact that goes A → B → A (never passing through null in
    // between — a retry failure whose wording flips back and forth across passes) would find its
    // second "A" still matching the stale dismissal and stay silenced forever.
    useEffect(() => {
        setDismissedSyncFailureKey((prev) =>
            prev !== null && prev !== standSyncFailureKey ? null : prev,
        );
    }, [standSyncFailureKey]);
    /**
     * Review P3 — "Updating…" must not flash on every `run()`: the busy toast only shows once
     * `soundProgress` actually has something to say, or `busy` has held for ~300ms without one.
     */
    const [busyToastVisible, setBusyToastVisible] = useState(false);
    useEffect(() => {
        if (!busy) {
            setBusyToastVisible(false);
            return;
        }
        if (soundProgress) {
            setBusyToastVisible(true);
            return;
        }
        const timer = window.setTimeout(() => setBusyToastVisible(true), 300);
        return () => window.clearTimeout(timer);
    }, [busy, soundProgress]);
    // Re-review P3 — `busyToastVisible` flips false via an effect, which runs AFTER the render
    // that already has `busy === false`: without this extra `busy` check, that one render would
    // still read the stale `busyToastVisible === true` and flash "Updating…" the instant a fast
    // action finished, which is exactly the flash `busyToastVisible`'s own debounce exists to
    // prevent on the way IN.
    const showBusy = busy && busyToastVisible;
    /**
     * #1460 — the stand's message toast, replacing the footer's single-slot status line. Busy
     * (debounced above) outranks a `message`; within `message`, `'warning'` persists with its own
     * close button, `'info'` auto-dismisses below. "Band is playing" and the offline label are
     * gone outright, not read here at all (acceptance: they appear nowhere on the stand). Review
     * P2 #1 — this is its OWN element now: a standing sync failure no longer masks it (see the
     * `StandStack` markup, `app/stand-stack.tsx`).
     */
    const toastTone: 'busy' | 'warning' | 'info' = showBusy
        ? 'busy'
        : messageTone === 'warning' && message
          ? 'warning'
          : 'info';
    const toastText = showBusy
        ? soundProgress || 'Updating…'
        : [message || null, pendingAutoplayHint, updateHint].filter(Boolean).join(' · ') || null;
    // Auto-dismiss a plain `info` message ~4s after it is actually SHOWN (masked time under the
    // busy spinner doesn't count against it, nor does the toast being hovered/focused — review
    // P2 #3/#5) — never `warning`, which persists until its own close button, and never the old
    // top-of-page banner (unrelated to this toast, `.error-banner` above), which handles errors
    // its own way. `messageToken` re-arms the timer for two identical messages in a row; it is
    // deliberately unread in the body below.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see above.
    useEffect(() => {
        if (toastTone !== 'info' || !message || toastHeld) {
            return;
        }
        const timer = window.setTimeout(() => setMessageState(''), 4000);
        return () => window.clearTimeout(timer);
    }, [message, messageToken, toastTone, toastHeld]);
    // Re-review P3 — WebKit fires no `focusout` when the focused element (the warning's close
    // button) is removed from under it, so `toastHeld` could get stuck `true` forever the moment
    // a warning is dismissed while focused. Resetting it whenever the toast goes empty is the
    // general fix: there is nothing left to "hold" once it has nothing to show.
    useEffect(() => {
        if (!toastText) {
            setToastHeld(false);
        }
    }, [toastText]);

    return {
        setMessage,
        announce,
        announcement,
        dismissMessage,
        toastTone,
        toastText,
        messageToken,
        setToastHeld,
        standSyncFailureVisible,
        dismissSyncFailure: () => setDismissedSyncFailureKey(standSyncFailureKey),
    };
}

import type { DeepSignal } from '../../../node_modules/deepsignal/dist/deepsignal';

export * from '../../../node_modules/deepsignal/dist/deepsignal';

/**
 * The runtime preserves the input object's public interface: DOM/Web Audio
 * instances are not proxied (deepsignal's SUPPORTED constructor predicate).
 * Its recursive declaration loses that assignability for HTMLElement arrays
 * when React's ambient DOM interfaces are present. Preserve the input interface
 * alongside signal accessors at this preview boundary; do not cast the state to
 * any or change its readonly fields. The original engine also typechecks under
 * its own, unmodified configuration before every preview check/build.
 */
type BrowserSafeSignal<T extends object> = T extends {
    readonly lastActiveDrumElements: HTMLElement[] | null;
}
    ? Omit<DeepSignal<T>, 'lastActiveDrumElements'> & Pick<T, 'lastActiveDrumElements'>
    : DeepSignal<T>;
export declare function deepSignal<T extends object>(object: T): BrowserSafeSignal<T>;

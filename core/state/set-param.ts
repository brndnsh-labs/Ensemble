/**
 * The one write `SET_PARAM` makes, shared by every slice reducer that handles it.
 *
 * It lands only on a field the slice declares: a slice's initial `deepSignal` object holds every
 * declared field as an own key (a field with no value starts `null`, never absent), so
 * `Object.hasOwn` is the runtime twin of the `keyof` check the `ActionPayloadSetParam` type makes
 * at compile time. A name that slips past the compiler (an `any` payload, a stale caller) is
 * dropped with a warning rather than silently growing the slice a field nothing reads.
 *
 * Returns true when the field exists and was written.
 */
export function writeDeclaredParam(
    slice: object,
    module: string,
    param: string,
    value: unknown,
): boolean {
    if (!Object.hasOwn(slice, param)) {
        console.warn(`SET_PARAM: '${module}' has no field '${param}' — ignored`);
        return false;
    }
    (slice as Record<string, unknown>)[param] = value;
    return true;
}

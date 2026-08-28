import type { CodecIssue } from './types.js';

export const SONGBOOK_MAX_INPUT_BYTES = 1024 * 1024;
export const SONGBOOK_MAX_DEPTH = 32;
export const SONGBOOK_MAX_VISITED_NODES = 100_000;
export const SONGBOOK_MAX_SECTIONS = 500;

export interface StructureInspection {
    nodes: number;
    maxDepth: number;
}

export type StructureInspectionResult =
    | { kind: 'ok'; value: StructureInspection }
    | { kind: 'invalid'; issue: CodecIssue };

function utf8ByteLength(value: string): number {
    return new TextEncoder().encode(value).byteLength;
}

export function exceedsUtf8ByteLimit(value: string, limit = SONGBOOK_MAX_INPUT_BYTES): boolean {
    // Every UTF-16 code unit needs at least one UTF-8 byte. This cheap guard
    // avoids allocating a second full-size buffer for obviously oversized input.
    return value.length > limit || utf8ByteLength(value) > limit;
}

type TraversalFrame =
    | { kind: 'visit'; candidate: unknown; depth: number; path: string }
    | {
          kind: 'array';
          candidate: unknown[];
          index: number;
          length: number;
          depth: number;
          path: string;
      }
    | {
          kind: 'object';
          candidate: Record<string, unknown>;
          keys: IterableIterator<string>;
          depth: number;
          path: string;
      };

function* ownEnumerableKeys(candidate: Record<string, unknown>): IterableIterator<string> {
    // A generator avoids allocating Object.keys/Object.entries for the entire
    // record before the visited-node ceiling has a chance to stop traversal.
    for (const key in candidate) {
        if (Object.hasOwn(candidate, key)) {
            yield key;
        }
    }
}

function unsafeInspectionIssue(path: string): CodecIssue {
    return {
        path,
        code: 'invalid-type',
        message: 'Songbook input could not be inspected safely',
    };
}

/**
 * Bound an already-parsed candidate before any schema-specific walk. Root is
 * depth 0, so 32 nested container edges are accepted and the 33rd is rejected.
 */
export function inspectSongbookStructure(value: unknown): StructureInspectionResult {
    const ancestors = new Set<object>();
    const stack: TraversalFrame[] = [{ kind: 'visit', candidate: value, depth: 0, path: '$' }];
    let nodes = 0;
    let maxDepth = 0;
    let minimumStringBytes = 0;

    while (stack.length > 0) {
        const frame = stack.pop();
        if (!frame) {
            break;
        }

        if (frame.kind === 'array') {
            if (frame.index >= frame.length) {
                ancestors.delete(frame.candidate);
                continue;
            }

            const index = frame.index;
            stack.push({ ...frame, index: index + 1 });
            let descriptor: PropertyDescriptor | undefined;
            try {
                descriptor = Object.getOwnPropertyDescriptor(frame.candidate, String(index));
            } catch {
                return { kind: 'invalid', issue: unsafeInspectionIssue(`${frame.path}.${index}`) };
            }
            if (!descriptor || descriptor.get || descriptor.set) {
                return {
                    kind: 'invalid',
                    issue: {
                        path: `${frame.path}.${index}`,
                        code: 'invalid-type',
                        message: 'Songbook arrays must be dense data arrays',
                    },
                };
            }
            stack.push({
                kind: 'visit',
                candidate: descriptor.value,
                depth: frame.depth + 1,
                path: `${frame.path}.${index}`,
            });
            continue;
        }

        if (frame.kind === 'object') {
            let next: IteratorResult<string>;
            try {
                next = frame.keys.next();
            } catch {
                return { kind: 'invalid', issue: unsafeInspectionIssue(frame.path) };
            }
            if (next.done) {
                ancestors.delete(frame.candidate);
                continue;
            }

            stack.push(frame);
            const key = next.value;
            minimumStringBytes += key.length;
            if (minimumStringBytes > SONGBOOK_MAX_INPUT_BYTES) {
                return {
                    kind: 'invalid',
                    issue: {
                        path: frame.path,
                        code: 'input-too-large',
                        message: `Songbook input exceeds ${SONGBOOK_MAX_INPUT_BYTES} UTF-8 bytes`,
                    },
                };
            }

            let descriptor: PropertyDescriptor | undefined;
            try {
                descriptor = Object.getOwnPropertyDescriptor(frame.candidate, key);
            } catch {
                return { kind: 'invalid', issue: unsafeInspectionIssue(`${frame.path}.${key}`) };
            }
            if (!descriptor || descriptor.get || descriptor.set) {
                return {
                    kind: 'invalid',
                    issue: {
                        path: `${frame.path}.${key}`,
                        code: 'invalid-type',
                        message: 'Songbook objects must contain data properties only',
                    },
                };
            }
            stack.push({
                kind: 'visit',
                candidate: descriptor.value,
                depth: frame.depth + 1,
                path: `${frame.path}.${key}`,
            });
            continue;
        }

        const { candidate, depth, path } = frame;
        nodes += 1;
        if (nodes > SONGBOOK_MAX_VISITED_NODES) {
            return {
                kind: 'invalid',
                issue: {
                    path,
                    code: 'structure-too-large',
                    message: `Songbook input exceeds ${SONGBOOK_MAX_VISITED_NODES} visited nodes`,
                },
            };
        }
        if (depth > SONGBOOK_MAX_DEPTH) {
            return {
                kind: 'invalid',
                issue: {
                    path,
                    code: 'structure-too-deep',
                    message: `Songbook input exceeds depth ${SONGBOOK_MAX_DEPTH}`,
                },
            };
        }
        maxDepth = Math.max(maxDepth, depth);

        if (
            candidate === undefined ||
            typeof candidate === 'function' ||
            typeof candidate === 'symbol' ||
            typeof candidate === 'bigint'
        ) {
            return {
                kind: 'invalid',
                issue: {
                    path,
                    code: 'invalid-type',
                    message: 'Songbook input must contain only JSON-compatible values',
                },
            };
        }
        if (typeof candidate === 'string') {
            minimumStringBytes += candidate.length;
            if (minimumStringBytes > SONGBOOK_MAX_INPUT_BYTES) {
                return {
                    kind: 'invalid',
                    issue: {
                        path,
                        code: 'input-too-large',
                        message: `Songbook input exceeds ${SONGBOOK_MAX_INPUT_BYTES} UTF-8 bytes`,
                    },
                };
            }
        }
        if (typeof candidate === 'number' && !Number.isFinite(candidate)) {
            return {
                kind: 'invalid',
                issue: {
                    path,
                    code: 'invalid-value',
                    message: 'Songbook numbers must be finite',
                },
            };
        }
        if (candidate === null || typeof candidate !== 'object') {
            continue;
        }

        let prototype: object | null;
        let isArray: boolean;
        try {
            prototype = Object.getPrototypeOf(candidate);
            isArray = Array.isArray(candidate);
        } catch {
            return { kind: 'invalid', issue: unsafeInspectionIssue(path) };
        }
        if (!isArray && prototype !== Object.prototype && prototype !== null) {
            return {
                kind: 'invalid',
                issue: {
                    path,
                    code: 'invalid-type',
                    message: 'Songbook input objects must be plain JSON records',
                },
            };
        }
        let toJsonDescriptor: PropertyDescriptor | undefined;
        try {
            toJsonDescriptor = Object.getOwnPropertyDescriptor(candidate, 'toJSON');
        } catch {
            return { kind: 'invalid', issue: unsafeInspectionIssue(path) };
        }
        if (
            toJsonDescriptor &&
            (toJsonDescriptor.get ||
                toJsonDescriptor.set ||
                typeof toJsonDescriptor.value === 'function')
        ) {
            return {
                kind: 'invalid',
                issue: {
                    path: `${path}.toJSON`,
                    code: 'invalid-type',
                    message: 'Songbook input must not customize JSON serialization',
                },
            };
        }
        if (ancestors.has(candidate)) {
            return {
                kind: 'invalid',
                issue: {
                    path,
                    code: 'cyclic-input',
                    message: 'Songbook input must be JSON-shaped and acyclic',
                },
            };
        }

        ancestors.add(candidate);
        if (isArray) {
            let lengthDescriptor: PropertyDescriptor | undefined;
            try {
                lengthDescriptor = Object.getOwnPropertyDescriptor(candidate, 'length');
            } catch {
                return { kind: 'invalid', issue: unsafeInspectionIssue(path) };
            }
            if (
                !lengthDescriptor ||
                lengthDescriptor.get ||
                lengthDescriptor.set ||
                typeof lengthDescriptor.value !== 'number' ||
                !Number.isSafeInteger(lengthDescriptor.value) ||
                lengthDescriptor.value < 0
            ) {
                return { kind: 'invalid', issue: unsafeInspectionIssue(`${path}.length`) };
            }
            const length = lengthDescriptor.value;
            if (length > SONGBOOK_MAX_VISITED_NODES - nodes) {
                return {
                    kind: 'invalid',
                    issue: {
                        path,
                        code: 'structure-too-large',
                        message: `Songbook input exceeds ${SONGBOOK_MAX_VISITED_NODES} visited nodes`,
                    },
                };
            }
            stack.push({
                kind: 'array',
                candidate: candidate as unknown[],
                index: 0,
                length,
                depth,
                path,
            });
        } else {
            stack.push({
                kind: 'object',
                candidate: candidate as Record<string, unknown>,
                keys: ownEnumerableKeys(candidate as Record<string, unknown>),
                depth,
                path,
            });
        }
    }

    return { kind: 'ok', value: { nodes, maxDepth } };
}

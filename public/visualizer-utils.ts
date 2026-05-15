const { min } = Math;

export class RingBuffer<T = unknown> {
    buffer: T[];
    capacity: number;
    start: number;
    count: number;

    constructor(capacity: number) {
        this.buffer = new Array(capacity);
        this.capacity = capacity;
        this.start = 0;
        this.count = 0;
    }

    get length(): number {
        return this.count;
    }

    push(item: T): void {
        if (this.count < this.capacity) {
            this.buffer[(this.start + this.count) % this.capacity] = item;
            this.count++;
        } else {
            this.buffer[this.start] = item;
            this.start = (this.start + 1) % this.capacity;
        }
    }

    at(index: number): T | undefined {
        if (index < 0 || index >= this.count) {
            return undefined;
        }
        return this.buffer[(this.start + index) % this.capacity];
    }

    clear(): void {
        this.start = 0;
        this.count = 0;
    }

    *[Symbol.iterator](): Iterator<T | undefined> {
        for (let i = 0; i < this.count; i++) {
            yield this.at(i);
        }
    }

    forEach(callback: (item: T, index: number) => unknown): void {
        const buffer = this.buffer;
        const capacity = this.capacity;
        const count = this.count;
        const start = this.start;

        const headLength = min(count, capacity - start);
        for (let i = 0; i < headLength; i++) {
            if (callback(buffer[start + i], i) === false) {
                return;
            }
        }

        if (headLength < count) {
            const tailLength = count - headLength;
            for (let i = 0; i < tailLength; i++) {
                if (callback(buffer[i], headLength + i) === false) {
                    return;
                }
            }
        }
    }
}

// Maps interval indices (0-11) to color categories: 0=root, 1=third, 2=fifth, 3=seventh
export const INTERVAL_CATEGORY = new Uint8Array([0, 3, 3, 1, 1, 3, 3, 2, 3, 3, 3, 3]);

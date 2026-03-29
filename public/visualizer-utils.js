const { min } = Math;

export class RingBuffer {
    /**
     * @param {number} capacity
     */
    constructor(capacity) {
        this.buffer = new Array(capacity);
        this.capacity = capacity;
        this.start = 0;
        this.count = 0;
    }

    get length() {
        return this.count;
    }

    /**
     * @param {any} item
     */
    push(item) {
        if (this.count < this.capacity) {
            this.buffer[(this.start + this.count) % this.capacity] = item;
            this.count++;
        } else {
            this.buffer[this.start] = item;
            this.start = (this.start + 1) % this.capacity;
        }
    }

    /**
     * @param {number} index
     */
    at(index) {
        if (index < 0 || index >= this.count) {
            return undefined;
        }
        return this.buffer[(this.start + index) % this.capacity];
    }

    clear() {
        this.start = 0;
        this.count = 0;
    }

    *[Symbol.iterator]() {
        for (let i = 0; i < this.count; i++) {
            yield this.at(i);
        }
    }

    /**
     * @param {function(any, number): any} callback
     */
    forEach(callback) {
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

// Optimization: Map interval indices (0-11) to color categories (0-3)
// 0=root, 1=third, 2=fifth, 3=seventh
export const INTERVAL_CATEGORY = new Uint8Array([0, 3, 3, 1, 1, 3, 3, 2, 3, 3, 3, 3]);

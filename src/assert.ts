export class AssertError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AssertError';
    }
}

export function assert(predicate: boolean, s: string) {
    if (!predicate) {
        throw new AssertError(s)
    }
}

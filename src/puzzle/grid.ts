/** An `n`×`n` grid of `false` — the shape used for clue/cell matrices. */
export function blank(n: number): boolean[][] {
    return Array.from({ length: n }, () => Array(n).fill(false))
}

/** Inclusive integer range `[start, end]`. */
export function range(start: number, end: number): number[] {
    return Array.from({ length: end - start + 1 }, (_, i) => i + start)
}

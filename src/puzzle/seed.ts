/** A fast, deterministic 32-bit seeded PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a |= 0
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** Format a date as `YYYY-MM-DD` using its local components. */
export function formatDate(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

/** Today's date as `YYYY-MM-DD` (local). */
export function dailyDate(date: Date = new Date()): string {
    return formatDate(date)
}

/**
 * A stable seed derived from a date, so every day yields the same puzzle.
 * Uses local date components (YYYY-M-D) fed through FNV-1a.
 */
export function seedFromDateString(dateStr: string): number {
    let h = 0x811c9dc5
    for (let i = 0; i < dateStr.length; i++) {
        h ^= dateStr.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
    }
    return h >>> 0
}

export function dailySeed(date: Date = new Date()): number {
    return seedFromDateString(dailyDate(date))
}

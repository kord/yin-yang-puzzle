import { describe, expect, it } from 'vitest'
import { generateRandomPuzzle } from './generator'
import { dailySeed } from './seed'

function key(p: ReturnType<typeof generateRandomPuzzle>): string {
    const rows = (m: boolean[][]) => m.map((r) => r.map((x) => (x ? '1' : '0')).join('')).join('|')
    return `${rows(p.fixedWhites as boolean[][])}/${rows(p.fixedBlacks as boolean[][])}`
}

describe('deterministic puzzle generation', () => {
    it('produces the identical puzzle for the same seed', () => {
        const size = { width: 6, height: 6 }
        const a = generateRandomPuzzle(size, 12345)
        const b = generateRandomPuzzle(size, 12345)
        expect(key(a)).toBe(key(b))
        expect(a.solution.isWhite).toEqual(b.solution.isWhite)
    })

    it('produces different puzzles for different seeds', () => {
        const size = { width: 6, height: 6 }
        const a = generateRandomPuzzle(size, 1)
        const b = generateRandomPuzzle(size, 2)
        expect(key(a)).not.toBe(key(b))
    })

    it('derives a stable daily seed from a fixed date', () => {
        const d15 = new Date(2026, 0, 15)
        expect(dailySeed(d15)).toBe(dailySeed(new Date(2026, 0, 15)))
        expect(dailySeed(d15)).not.toBe(dailySeed(new Date(2026, 0, 16)))
    })
})

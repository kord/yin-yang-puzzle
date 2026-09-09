import { describe, expect, it } from 'vitest'
import { encodePuzzle, decodePuzzle } from './encode'

function make(size: number, whites: number[][], blacks: number[][]): Parameters<typeof encodePuzzle>[0] {
    const fw = Array.from({ length: size }, () => Array(size).fill(false))
    const fb = Array.from({ length: size }, () => Array(size).fill(false))
    for (const [r, c] of whites) fw[r][c] = true
    for (const [r, c] of blacks) fb[r][c] = true
    return { size: { width: size, height: size }, fixedWhites: fw, fixedBlacks: fb }
}

describe('puzzle URL encoding (dense/sparse)', () => {
    it('roundtrips and picks the shorter of the two forms', () => {
        const cases = [
            make(4, [], []),
            make(4, [[0, 0]], []),
            make(6, [[0, 0], [5, 5]], []),
            make(6, [[0, 0], [5, 5], [2, 3]], [[0, 3], [4, 1]]),
            // near full — sparse would be longer, so dense should win.
            make(6, [...Array(18).keys()].map((i) => [Math.floor(i / 6), i % 6]),
                [...Array(18).keys()].map((i) => [Math.floor(i / 6) + 3, i % 6])),
        ]
        for (const p of cases) {
            const enc = encodePuzzle(p)
            const dec = decodePuzzle(enc)
            expect(dec).not.toBeNull()
            expect(JSON.stringify(dec)).toBe(JSON.stringify(p))
            // output must be URL-safe (no '-')
            expect(enc.includes('-')).toBe(false)
        }
    })

    it('is deterministic — the same puzzle always encodes identically', () => {
        const p = make(6, [[0, 0], [5, 5]], [[0, 5]])
        expect(encodePuzzle(p)).toBe(encodePuzzle(p))
    })

    it('obfuscates structure — same-count puzzles share no readable prefix', () => {
        // Four different 1-given 6x6 puzzles. The mask is seeded by a hash of the
        // whole stream, so their encodings must not share a leading run even
        // though they all have the same hint count.
        const oneGiven = [
            make(6, [[0, 0]], []),
            make(6, [], [[0, 0]]),
            make(6, [[2, 2]], []),
            make(6, [], [[4, 4]]),
        ].map(encodePuzzle)
        expect(new Set(oneGiven.map((e) => e.slice(0, 4))).size).toBe(4)

        // Two 6-given 6x6 puzzles should also diverge immediately.
        const sixGivens = [
            make(6, [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]], []),
            make(6, [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]], []),
        ].map(encodePuzzle)
        expect(sixGivens[0].slice(0, 4)).not.toBe(sixGivens[1].slice(0, 4))
    })
})

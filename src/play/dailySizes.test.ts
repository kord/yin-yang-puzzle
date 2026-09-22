import { describe, expect, it } from 'vitest'
import { DEFAULT_SIZE, SIZES } from './usePuzzleSession'
import { generateRandomPuzzle } from '../puzzle/generator'
import { hasMonochrome2x2, isColorConnected } from '../puzzle/rules'
import YYSolver from '../puzzle/YYSolver'

/**
 * Sizes above this take tens of seconds to generate (16x16 measured at a median of
 * 25 s, max 48 s across date seeds), so they are covered by the gated harness
 * `scratch/gen-tail.test.js` rather than the suite.
 */
const FAST_LIMIT = 12

describe('daily puzzle size list', () => {
    it('offers the default size', () => {
        expect(SIZES).toContain(DEFAULT_SIZE)
    })

    it('is strictly ascending and within the supported range', () => {
        expect([...SIZES].sort((a, b) => a - b)).toEqual([...SIZES])
        expect(SIZES[0]).toBeGreaterThanOrEqual(3)
        expect(SIZES[SIZES.length - 1]).toBeLessThanOrEqual(20)
    })

    it('generates a valid, uniquely solvable puzzle at every fast size', () => {
        for (const n of SIZES.filter((s) => s <= FAST_LIMIT)) {
            const puzzle = generateRandomPuzzle({ width: n, height: n }, 12345)
            const { isWhite } = puzzle.solution
            expect(hasMonochrome2x2(isWhite), `${n}x${n}: solution has a 2x2 block`).toBe(false)
            expect(isColorConnected(isWhite, true), `${n}x${n}: white is split`).toBe(true)
            expect(isColorConnected(isWhite, false), `${n}x${n}: black is split`).toBe(true)
            expect(new YYSolver(puzzle).uniqueSolution(), `${n}x${n}: not uniquely solvable`).not.toBeNull()
        }
    })
})

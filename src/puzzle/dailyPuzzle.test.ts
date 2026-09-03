import { beforeAll, describe, expect, it } from 'vitest'
import { generateRandomPuzzle } from './generator'
import { seedFromDateString } from './seed'
import type { YinYangPuzzleDefinition } from './types'

// Expected unique solution for the 2026-09-02 daily puzzle at 12×12.
// This freezes the deterministic generation so a change to the generator or
// solver that alters this date's solution will fail the regression.
const EXPECTED_SOLUTION = [
    'WWWWWWWWWWWW',
    'WBBWBBBBWBBW',
    'WWBBBWBWWBWW',
    'WBBWWWBBBBBW',
    'WBWWBBBWBWBW',
    'WBWBBWWWWWBW',
    'WBWWBBWBBWWW',
    'WBBWBWWWBBBW',
    'WBWWBBBBBWWW',
    'WBWBBWWBWWBW',
    'WBWBWWBBBBBW',
    'WWWWWBBWWWWW',
]

const SIZE = { width: 12, height: 12 }

describe('daily regression: 2026-09-02 12×12', () => {
    let puzzle: YinYangPuzzleDefinition

    beforeAll(() => {
        puzzle = generateRandomPuzzle(SIZE, seedFromDateString('2026-09-02'))
    }, 120000)

    it('generates the expected unique solution', () => {
        const render = (isWhite: boolean[][]) =>
            isWhite.map((row) => row.map((w) => (w ? 'W' : 'B')).join(''))
        expect(render(puzzle.solution.isWhite)).toEqual(EXPECTED_SOLUTION)
    })

    it('produces a valid Yin-Yang solution (full, no 2×2 monochrome, connected)', () => {
        const g = puzzle.solution.isWhite
        const n = g.length
        expect(n).toBe(12)
        for (const row of g) expect(row).toHaveLength(12)

        // Every cell is filled (a valid solution has a colour everywhere).
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                expect(typeof g[r][c]).toBe('boolean')
            }
        }

        // No 2×2 block may be a single colour.
        for (let r = 0; r < n - 1; r++) {
            for (let c = 0; c < n - 1; c++) {
                const a = g[r][c]
                const monochrome =
                    g[r][c + 1] === a && g[r + 1][c] === a && g[r + 1][c + 1] === a
                expect(monochrome).toBe(false)
            }
        }

        // Each colour must form a single connected group.
        expect(isConnected(g, true)).toBe(true)
        expect(isConnected(g, false)).toBe(true)
    })

    it('matches the given/clue cells', () => {
        const g = puzzle.solution.isWhite
        const n = g.length
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                if (puzzle.fixedWhites[r][c]) expect(g[r][c]).toBe(true)
                if (puzzle.fixedBlacks[r][c]) expect(g[r][c]).toBe(false)
            }
        }
    })
})

/** True if all cells of `white` (or black when `false`) form one orthogonal group. */
function isConnected(g: boolean[][], white: boolean): boolean {
    const n = g.length
    const visited = Array.from({ length: n }, () => Array(n).fill(false))

    let start: [number, number] | null = null
    for (let r = 0; r < n && !start; r++) {
        for (let c = 0; c < n; c++) {
            if (g[r][c] === white) {
                start = [r, c]
                break
            }
        }
    }
    if (!start) return true

    const stack: [number, number][] = [start]
    let reached = 0
    while (stack.length) {
        const [r, c] = stack.pop()!
        if (r < 0 || c < 0 || r >= n || c >= n || visited[r][c] || g[r][c] !== white) continue
        visited[r][c] = true
        reached++
        stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1])
    }

    let total = 0
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (g[r][c] === white) total++
    return reached === total
}

/**
 * Verifies the rewritten clue-removal loop: is the puzzle still uniquely solvable,
 * is the recorded solution valid, and does a 16x16 or 20x20 run still fit the
 * fixed wasm heap (16x16 used to abort in `enlargeMemory`).
 *
 * Clue counts for the 2026-09-16/17/18 and seed-12345 rows are the numbers the
 * previous implementation produced, so a mismatch there means the rewrite changed
 * which clues survive rather than just how fast they were chosen.
 *
 * Stops at 16x16 on purpose. 20x20 still aborts in `enlargeMemory`: its base model
 * is already ~40k clauses against a 64 MiB heap, so there is no room for the
 * learned clauses a long incremental run accumulates. Nothing generates above
 * 12x12 in the app (`SIZES = range(4, 12)`), so that is a tools-only limit — and it
 * is the concrete motivation for a leaner encoding.
 *
 *   $env:GEN_VERIFY='1'; npx vitest run scratch/gen-verify.test.js
 */
import { describe, it, expect } from 'vitest'
import { appendFileSync, writeFileSync } from 'node:fs'
import YYSolver from '../src/puzzle/YYSolver'
import { generateRandomPuzzle } from '../src/puzzle/generator'
import { seedFromDateString } from '../src/puzzle/seed'
import { hasMonochrome2x2, isColorConnected } from '../src/puzzle/rules'

const ENABLED = !!process.env.GEN_VERIFY
const CHECK_UNIQUE_UPTO = Number(process.env.GEN_UNIQUE_UPTO || 12)

const OUT = new URL('./gen-verify.out.txt', import.meta.url)
writeFileSync(OUT, '')
const log = (...a) => {
    const line = a.join(' ')
    console.log(line)
    appendFileSync(OUT, line + '\n')
}

const cluesOf = (puzzle) => puzzle.fixedWhites.flat().filter(Boolean).length +
    puzzle.fixedBlacks.flat().filter(Boolean).length

const cluesMatchSolution = (puzzle) => {
    const { isWhite } = puzzle.solution
    for (let r = 0; r < isWhite.length; r++) {
        for (let c = 0; c < isWhite.length; c++) {
            if (puzzle.fixedWhites[r][c] && !isWhite[r][c]) return false
            if (puzzle.fixedBlacks[r][c] && isWhite[r][c]) return false
        }
    }
    return true
}

const render = (grid) => grid.map((row) => row.map((w) => (w ? 'W' : 'B')).join('')).join('/')

// label, size, seed, clues the old implementation produced for this row
const CASES = [
    ['3x3 seed 12345', 3, 12345, null],
    ['4x4 seed 12345', 4, 12345, null],
    ['5x5 seed 12345', 5, 12345, null],
    ['12x12 2026-09-16', 12, seedFromDateString('2026-09-16'), 37],
    ['12x12 2026-09-17', 12, seedFromDateString('2026-09-17'), 30],
    ['12x12 2026-09-18', 12, seedFromDateString('2026-09-18'), 24],
    ['10x10 seed 12345', 10, 12345, 16],
    ['12x12 seed 12345', 12, 12345, 35],
    ['16x16 seed 12345', 16, 12345, null],
]

describe.runIf(ENABLED)('generator rewrite verification', () => {
    it('keeps puzzles valid and unique, and survives the large sizes', () => {
        log('')
        for (const [label, n, seed, expectedClues] of CASES) {
            const size = { width: n, height: n }
            const t0 = performance.now()
            const puzzle = generateRandomPuzzle(size, seed)
            const ms = Math.round((performance.now() - t0) * 10) / 10
            const clues = cluesOf(puzzle)
            const { isWhite } = puzzle.solution

            const valid = !hasMonochrome2x2(isWhite) &&
                isColorConnected(isWhite, true) && isColorConnected(isWhite, false)
            expect(valid, `${label}: generated solution is not a valid Yin-Yang`).toBe(true)
            expect(cluesMatchSolution(puzzle), `${label}: clue contradicts the solution`).toBe(true)

            let uniqueNote = 'skipped'
            if (n <= CHECK_UNIQUE_UPTO) {
                const solved = new YYSolver(puzzle).uniqueSolution()
                expect(solved, `${label}: puzzle is not uniquely solvable`).not.toBeNull()
                expect(render(solved.isWhite), `${label}: unique solution differs from the recorded one`)
                    .toBe(render(isWhite))
                uniqueNote = 'unique ✓'
            }

            const matchesOld = expectedClues === null
                ? '—'
                : clues === expectedClues ? 'same as before' : `WAS ${expectedClues}`
            log(`${label.padEnd(18)} ${String(ms).padStart(8)} ms  ${String(clues).padStart(3)} clues  ` +
                `${uniqueNote.padEnd(10)} ${matchesOld}`)
        }
        log('')
    }, 3_600_000)
})

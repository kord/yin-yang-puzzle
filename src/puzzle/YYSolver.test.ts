import { describe, expect, it } from 'vitest'
import YYSolver from './YYSolver'
import type { YinYangPuzzlePartialDefinition } from './types'

function puzzleFromRows(rows: string[]): YinYangPuzzlePartialDefinition {
    const n = rows.length
    return {
        size: { width: n, height: n },
        fixedWhites: rows.map((r) => r.split('').map((ch) => ch === 'w')),
        fixedBlacks: rows.map((r) => r.split('').map((ch) => ch === 'b')),
    }
}

describe('YYSolver.extensions()', () => {
    it('does not force a fully-enclosed cell for an unsolvable configuration', () => {
        // Regression: this layout used to be reported as forcing an enclosed white.
        const rows = ['......', '.bbb..', '.b.b..', '..b...', '......', '......']
        const solver = new YYSolver(puzzleFromRows(rows))

        expect(solver.anySolution()).toBeNull()

        const ext = solver.extensions()
        for (let r = 0; r < rows.length; r++) {
            for (let c = 0; c < rows.length; c++) {
                const p = ext.possibilities[r][c]
                if (p.fixed) continue
                // No non-fixed cell may be forced to a single colour.
                expect(p.whitePossible && !p.blackPossible).toBe(false)
                expect(p.blackPossible && !p.whitePossible).toBe(false)
            }
        }
    })

    it('finds the unique solution and forces every non-fixed cell for the known 6x6 puzzle', () => {
        const rows = ['xxxxxb', 'xxwxxw', 'xxxxwx', 'xxwxxx', 'xwxbxx', 'xxxxxx']
        const solver = new YYSolver(puzzleFromRows(rows))

        const unique = solver.uniqueSolution()
        expect(unique).not.toBeNull()
        const render = (isWhite: boolean[][]) =>
            isWhite.map((row) => row.map((w) => (w ? 'W' : 'B')).join('')).join('/')
        expect(render(unique!.isWhite)).toBe('BBBBBB/BWWWBW/BBBWWW/BWWWBW/BWBBBW/BBBWWW')

        const ext = solver.extensions()
        for (let r = 0; r < rows.length; r++) {
            for (let c = 0; c < rows.length; c++) {
                const p = ext.possibilities[r][c]
                if (p.fixed) continue
                // Unique solution => every non-fixed cell is forced to exactly one colour.
                expect(p.whitePossible !== p.blackPossible).toBe(true)
            }
        }
    })
})

/**
 * The boundary-ring ("wrap") case.
 *
 * The 5x5 board below is a genuine Yin-Yang solution: both colours are connected
 * and no 2x2 is monochrome. Its interface is a *closed* curve, so the colour class
 * holding the boundary ring contains a cycle and fails the tree count
 * (verts == edges + 1). YYSolver used to require that count unconditionally, which
 * made this board — and every clue set forcing it — come back as "No solution".
 *
 * It is the one exception in Demaine, Lynch, Rudoy and Uno, "Yin-Yang Puzzles are
 * NP-complete" (CCCG 2021): the unique cycle of a colour class must be exactly the
 * boundary ring. It can only happen when the (h-1) x (w-1) interior lattice admits
 * a Hamiltonian cycle, i.e. when both are >= 2 and their product is even, which for
 * squares means the odd sizes: 5x5, 7x7, 9x9, 11x11. The 4x4 case below is the
 * control: it cannot wrap, so it must keep working through the tree branch.
 */
describe('YYSolver and the boundary-ring case', () => {
    const N = 5
    const PATTERN = ['BBBBB', 'BWBWB', 'BWWWB', 'BWBWB', 'BBBBB']
    /** Leave one cell free; the other colour disconnects white, so the completion is unique. */
    const FREE = { row: 2, col: 2 }

    const toFlags = (pattern: string[]) => pattern.map((row) => row.split('').map((ch) => ch === 'W'))
    const renderRows = (isWhite: boolean[][]) =>
        isWhite.map((row) => row.map((w) => (w ? 'W' : 'B')).join(''))

    const wrapPuzzle = (): YinYangPuzzlePartialDefinition => ({
        size: { width: N, height: N },
        fixedWhites: toFlags(PATTERN).map((row, r) => row.map((w, c) => w && !(r === FREE.row && c === FREE.col))),
        fixedBlacks: toFlags(PATTERN).map((row) => row.map((w) => !w)),
    })

    it('finds the completion whose interface closes into a loop', () => {
        const solution = new YYSolver(wrapPuzzle()).anySolution()
        expect(solution).not.toBeNull()
        expect(renderRows(solution!.isWhite)).toEqual(PATTERN)
    })

    it('reports that wrap case as the unique solution', () => {
        const solution = new YYSolver(wrapPuzzle()).uniqueSolution()
        expect(solution).not.toBeNull()
        expect(renderRows(solution!.isWhite)).toEqual(PATTERN)
    })

    it('still solves an even-sized board through the tree branch', () => {
        // 4x4 interior lattice is 3x3 (odd), so a closed interface is impossible and
        // the plain tree constraint must be enough on its own.
        const size = { width: 4, height: 4 }
        const blank = Array.from({ length: 4 }, () => Array(4).fill(false))
        const solution = new YYSolver({ size, fixedWhites: blank, fixedBlacks: blank }).anySolution()
        expect(solution).not.toBeNull()
    })
})

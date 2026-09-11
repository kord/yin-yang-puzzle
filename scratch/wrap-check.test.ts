import { describe, expect, it } from 'vitest'
import YYSolver from '../src/puzzle/YYSolver'

/**
 * Regression test for the boundary-ring ("wrap") case.
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
const N = 5
const PATTERN = ['BBBBB', 'BWBWB', 'BWWWB', 'BWBWB', 'BBBBB']
/** Leave one cell free; the other colour disconnects white, so the completion is unique. */
const FREE = { row: 2, col: 2 }

const toFlags = (pattern: string[]) => pattern.map((row) => row.split('').map((ch) => ch === 'W'))
const render = (isWhite: boolean[][]) => isWhite.map((row) => row.map((w) => (w ? 'W' : 'B')).join(''))

const wrapPuzzle = () => ({
    size: { width: N, height: N },
    fixedWhites: toFlags(PATTERN).map((row, r) => row.map((w, c) => w && !(r === FREE.row && c === FREE.col))),
    fixedBlacks: toFlags(PATTERN).map((row) => row.map((w) => !w)),
})

describe('YYSolver and the boundary-ring case', () => {
    it('finds the completion whose interface closes into a loop', () => {
        const solution = new YYSolver(wrapPuzzle()).anySolution()
        expect(solution).not.toBeNull()
        expect(render(solution!.isWhite)).toEqual(PATTERN)
    })

    it('reports that wrap case as the unique solution', () => {
        const solution = new YYSolver(wrapPuzzle()).uniqueSolution()
        expect(solution).not.toBeNull()
        expect(render(solution!.isWhite)).toEqual(PATTERN)
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

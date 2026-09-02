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

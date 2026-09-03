import YYSolver from './YYSolver'
import { mulberry32 } from './seed'
import type {
    YinYangPuzzleDefinition,
    YinYangPuzzlePartialDefinition,
    YinYangPuzzleSolution,
    Size,
} from './types'

function blank(n: number): boolean[][] {
    return Array.from({ length: n }, () => Array(n).fill(false))
}

function seedPartial(size: Size, cells: { row: number; col: number; white: boolean }[]): YinYangPuzzlePartialDefinition {
    const n = size.width
    const fixedWhites = blank(n)
    const fixedBlacks = blank(n)
    for (const c of cells) {
        if (c.white) fixedWhites[c.row][c.col] = true
        else fixedBlacks[c.row][c.col] = true
    }
    return { size, fixedWhites, fixedBlacks }
}

/**
 * Produce a random valid yin-yang board.
 *
 * The SAT solver is deterministic, so to get variety we seed a handful of
 * random cells with random colours and let the solver complete the board.
 * If a seed happens to be contradictory we simply retry with a fresh set.
 */
export function randomSolution(size: Size, rng: () => number = Math.random): YinYangPuzzleSolution {
    const n = size.width
    const total = n * n
    const k = Math.max(2, Math.min(6, Math.floor(total / 4)))

    for (let attempt = 0; attempt < 8; attempt++) {
        const cells: { row: number; col: number; white: boolean }[] = []
        const used = new Set<string>()
        while (cells.length < k) {
            const r = Math.floor(rng() * n)
            const c = Math.floor(rng() * n)
            const key = `${r},${c}`
            if (used.has(key)) continue
            used.add(key)
            cells.push({ row: r, col: c, white: rng() < 0.5 })
        }
        const sol = new YYSolver(seedPartial(size, cells)).anySolution()
        if (sol) return sol
    }

    // Fallback: no seeds.
    const sol = new YYSolver(seedPartial(size, [])).anySolution()
    if (!sol) throw new Error('No yin-yang solution exists for this size')
    return sol
}

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
            ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
}

/**
 * Generate a puzzle with a unique solution.
 *
 * Start from a random full solution, give every cell as a clue, then try to
 * remove clues one at a time (in a random order), keeping a removal only when
 * the puzzle is still uniquely solvable. The result is guaranteed to have a
 * single solution.
 */
export function generateRandomPuzzle(size: Size, seed?: number): YinYangPuzzleDefinition {
    const rng = mulberry32(seed ?? (Math.random() * 0xffffffff) >>> 0)
    const solution = randomSolution(size, rng)
    const n = size.width
    const isWhite = solution.isWhite

    const fixedWhites = blank(n)
    const fixedBlacks = blank(n)
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (isWhite[r][c]) fixedWhites[r][c] = true
            else fixedBlacks[r][c] = true
        }
    }

    const order: [number, number][] = []
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) order.push([r, c])
    }
    shuffle(order, rng)

    for (const [r, c] of order) {
        const saveW = fixedWhites[r][c]
        const saveB = fixedBlacks[r][c]
        fixedWhites[r][c] = false
        fixedBlacks[r][c] = false
        const unique = new YYSolver({ size, fixedWhites, fixedBlacks }).uniqueSolution()
        if (unique === null) {
            // Removing this clue makes the puzzle ambiguous — put it back.
            fixedWhites[r][c] = saveW
            fixedBlacks[r][c] = saveB
        }
    }

    return { size, fixedWhites, fixedBlacks, solution }
}

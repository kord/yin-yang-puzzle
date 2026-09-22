import YYSolver from './YYSolver'
import { mulberry32 } from './seed'
import { blank } from './grid'
import type {
    YinYangPuzzleDefinition,
    YinYangPuzzlePartialDefinition,
    YinYangPuzzleSolution,
    Size,
} from './types'

/** A cell held at a colour while the clue-removal loop tests the others. */
interface Clue {
    row: number
    col: number
    white: boolean
}

/**
 * Candidates to test against one base solver before rebuilding it, for boards
 * large enough that the heap demands it. See `rebuildEvery` below.
 */
const LARGE_BOARD_REBUILD_EVERY = 64

/** Above this width the accumulated learned clauses exhaust the fixed wasm heap. */
const LARGE_BOARD_WIDTH = 12

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

    // Keep drawing fresh random seeds until the deterministic solver returns a
    // valid Yin-Yang. Never fall back to a seedless solve — that always yields the
    // same board, which would cause repeat puzzles across days. A valid board
    // always exists, and a handful of random seeds succeeds within a few tries.
    for (; ;) {
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
 *
 * One solver holds the structural model for the whole run, and the surviving clue
 * set is handed to it per candidate as solve-time assumptions. Rebuilding that
 * model per candidate is what used to dominate generation — the encoding is
 * identical every time, so paying it n² times was pure waste. Measured at 59x on
 * 12x12 (13.6 s -> 0.23 s) for an identical clue set.
 */
export function generateRandomPuzzle(size: Size, seed?: number): YinYangPuzzleDefinition {
    const rng = mulberry32(seed ?? (Math.random() * 0xffffffff) >>> 0)
    const solution = randomSolution(size, rng)
    const n = size.width
    const isWhite = solution.isWhite

    const order: [number, number][] = []
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) order.push([r, c])
    }
    shuffle(order, rng)

    // Every cell starts as a clue. A removal is kept only when the puzzle stays
    // unique, so the invariant "this clue set determines the board" holds at every
    // step — which is what makes the single-cell removal test exact.
    const clues: Clue[] = []
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) clues.push({ row: r, col: c, white: isWhite[r][c] })
    }

    const empty = () => new YYSolver({ size, fixedWhites: blank(n), fixedBlacks: blank(n) })
    let solver = empty()

    // Learned clauses from assumption-based solves are only valid while their
    // assumptions hold, so MiniSat accumulates them across candidates. The wasm
    // heap is a fixed size and aborts rather than growing — at 16x16 a single
    // base solver used for the whole loop dies in `enlargeMemory` — and the
    // growth is not visible from the JS side, so the base is rebuilt on a
    // candidate count. Rebuilding is not free: it drops the learned clauses that
    // make the loop fast, so only do it where the heap forces the issue.
    // Measured: 12x12 and below run the whole loop on one solver; 16x16 needs the
    // rebuild, and pays for it (see scratch/gen-verify.test.js).
    const rebuildEvery = n <= LARGE_BOARD_WIDTH ? Number.POSITIVE_INFINITY : LARGE_BOARD_REBUILD_EVERY
    let sinceRebuild = 0

    for (const [r, c] of order) {
        if (++sinceRebuild >= rebuildEvery) {
            solver = empty()
            sinceRebuild = 0
        }
        if (solver.hasAlternativeSolution(clues, r, c, isWhite[r][c])) {
            // Dropping this clue would admit a second solution — keep the clue.
            continue
        }
        const at = clues.findIndex((clue) => clue.row === r && clue.col === c)
        if (at >= 0) clues.splice(at, 1)
    }

    const fixedWhites = blank(n)
    const fixedBlacks = blank(n)
    for (const clue of clues) {
        if (clue.white) fixedWhites[clue.row][clue.col] = true
        else fixedBlacks[clue.row][clue.col] = true
    }

    return { size, fixedWhites, fixedBlacks, solution }
}

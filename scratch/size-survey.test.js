/**
 * Survey of candidate daily-puzzle sizes, now that generation is ~50x cheaper.
 *
 * For each size: how long a fresh puzzle takes, how dense its clues are, what the
 * interactive paths cost (hints/design mode via `extensions()`), and — on the odd
 * sizes, whose interior lattice is even — how often the board wraps, i.e. one
 * colour encloses the other. A wrapping board is the boundary-ring case, and the
 * only size-dependent structural difference the app has.
 *
 *   $env:GEN_SURVEY='1'; npx vitest run scratch/size-survey.test.js
 */
import { describe, it } from 'vitest'
import { appendFileSync, writeFileSync } from 'node:fs'
import YYSolver from '../src/puzzle/YYSolver'
import { generateRandomPuzzle, randomSolution } from '../src/puzzle/generator'
import { mulberry32, seedFromDateString } from '../src/puzzle/seed'
import { hasMonochrome2x2, isColorConnected } from '../src/puzzle/rules'

const ENABLED = !!process.env.GEN_SURVEY
const MIN = Number(process.env.GEN_SURVEY_MIN || 3)
const MAX = Number(process.env.GEN_SURVEY_MAX || 14)
const SAMPLES = Number(process.env.GEN_SURVEY_SAMPLES || 200)

const OUT = new URL('./size-survey.out.txt', import.meta.url)
writeFileSync(OUT, '')
const log = (...a) => {
    const line = a.join(' ')
    console.log(line)
    appendFileSync(OUT, line + '\n')
}
const ms = (t0) => Math.round((performance.now() - t0) * 10) / 10

/**
 * True when a colour class carries exactly one independent cycle (verts == edges)
 * instead of being a tree (verts == edges + 1): the boundary ring.
 */
const wraps = (isWhite, n) => {
    for (const want of [true, false]) {
        let verts = 0
        let edges = 0
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                if (isWhite[r][c] !== want) continue
                verts++
                if (c + 1 < n && isWhite[r][c + 1] === want) edges++
                if (r + 1 < n && isWhite[r + 1][c] === want) edges++
            }
        }
        if (verts > 0 && verts === edges) return true
    }
    return false
}

const clueCount = (puzzle) => puzzle.fixedWhites.flat().filter(Boolean).length +
    puzzle.fixedBlacks.flat().filter(Boolean).length

describe.runIf(ENABLED)('daily size survey', () => {
    it('measures every candidate size', () => {
        log(`\nsamples=${SAMPLES} for the wrap share; one generation per size\n`)
        log('size   generate    clues  density   extensions()   wrap share')
        for (let n = MIN; n <= MAX; n++) {
            const size = { width: n, height: n }
            const seed = seedFromDateString('2026-09-18')

            const t0 = performance.now()
            const puzzle = generateRandomPuzzle(size, seed)
            const genMs = ms(t0)

            const clues = clueCount(puzzle)
            const density = ((100 * clues) / (n * n)).toFixed(0) + '%'

            const { isWhite } = puzzle.solution
            const valid = !hasMonochrome2x2(isWhite) &&
                isColorConnected(isWhite, true) && isColorConnected(isWhite, false)
            if (!valid) log(`  !! ${n}x${n} produced an invalid board`)

            // The interactive path: design mode reruns `extensions()` on every
            // (debounced) edit, so this is the latency a size buys at the top end.
            let extMs = null
            {
                const tExt = performance.now()
                new YYSolver(puzzle).extensions()
                extMs = ms(tExt)
            }

            // Structural class of the generated board.
            const rng = mulberry32(1234 + n)
            let wrapped = 0
            for (let i = 0; i < SAMPLES; i++) {
                const sol = randomSolution(size, rng)
                if (wraps(sol.isWhite, n)) wrapped++
            }
            const share = `${((100 * wrapped) / SAMPLES).toFixed(1)}%` + (n % 2 === 1 ? ' (odd size)' : '')

            log(`${(n + 'x' + n).padEnd(7)}${String(genMs).padStart(8)} ms` +
                `${String(clues).padStart(8)}${density.padStart(9)}` +
                `${(extMs === null ? 'too slow' : extMs + ' ms').padStart(15)}` +
                `${share.padStart(15)}`)
        }
        log('')
    }, 3_600_000)
})

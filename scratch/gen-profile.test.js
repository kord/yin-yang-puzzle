/**
 * Generation profiler + equivalence check. Not part of `npm test` unless
 * GEN_PROFILE (or GEN_EQUIV) is set:
 *
 *   $env:GEN_PROFILE='1'; $env:GEN_SIZE='12'; npx vitest run scratch/gen-profile.test.js
 *   $env:GEN_EQUIV='1'; npx vitest run scratch/gen-profile.test.js
 *
 * Counts real MiniSat solves by patching Logic.Solver#solve (both solve() and
 * solveAssuming() funnel through it) so the numbers are calls, not guesses.
 */
import { describe, it } from 'vitest'
import { appendFileSync, writeFileSync } from 'node:fs'
import Logic from 'logic-solver'
import YYSolver from '../src/puzzle/YYSolver'
import { generateRandomPuzzle, randomSolution } from '../src/puzzle/generator'
import { blank } from '../src/puzzle/grid'
import { mulberry32 } from '../src/puzzle/seed'

const ENABLED = !!process.env.GEN_PROFILE
const EQUIV = !!process.env.GEN_EQUIV
const FAST_ONLY = !!process.env.GEN_FAST_ONLY
const N = Number(process.env.GEN_SIZE || 10)
const SEED = Number(process.env.GEN_SEED || 12345)

// --- instrumentation ---------------------------------------------------------
let solves = 0
const realSolve = Logic.Solver.prototype.solve
Logic.Solver.prototype.solve = function patched(...args) {
    solves++
    return realSolve.apply(this, args)
}
const reset = () => (solves = 0)

const OUT = new URL('./gen-profile.out.txt', import.meta.url)
writeFileSync(OUT, '')
const log = (...a) => {
    const line = a.join(' ')
    console.log(line)
    appendFileSync(OUT, line + '\n')
}
const ms = (fn) => {
    const t0 = performance.now()
    const value = fn()
    return { ms: performance.now() - t0, value }
}

const cell = (r, c) => `cell_${r}_${c}`
const sizeOf = (n) => ({ height: n, width: n })

function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
            ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
}

/** The exact board + removal order `generateRandomPuzzle(size, seed)` uses. */
function setup(n, seed) {
    const rng = mulberry32(seed)
    const solution = randomSolution(sizeOf(n), rng)
    const order = []
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) order.push([r, c])
    shuffle(order, rng)
    return { solution, order }
}

function clueKey(fw, fb, n) {
    let out = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        out += fw[r][c] ? 'w' : fb[r][c] ? 'b' : 'x'
    }
    return out
}

const cluesOf = (isWhite, n) => {
    const fw = blank(n)
    const fb = blank(n)
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (isWhite[r][c]) fw[r][c] = true
        else fb[r][c] = true
    }
    return { fw, fb }
}

/**
 * Replays the shipped removal loop with a cheaper removal test.
 *
 *  - 'fresh': one solve per candidate, but a freshly built solver each time —
 *    isolates the algorithmic win (n^2 solves instead of ~n^3) from the
 *    encoding win.
 *  - 'persistent': one solver holding every structural constraint, with the
 *    clues supplied as a solve-time assumption. Learned clauses and the
 *    accumulated connectivity cuts are then reused by every later candidate.
 */
function removalLoop(mode, n, seed) {
    const { solution, order } = setup(n, seed)
    const { fw, fb } = cluesOf(solution.isWhite, n)

    if (mode === 'fresh') {
        for (const [r, c] of order) {
            const saveW = fw[r][c]
            const saveB = fb[r][c]
            fw[r][c] = false
            fb[r][c] = false
            const s = new YYSolver({ size: sizeOf(n), fixedWhites: fw, fixedBlacks: fb })
            const flip = solution.isWhite[r][c] ? Logic.not(cell(r, c)) : cell(r, c)
            if (s.solveConnected(flip)) {
                fw[r][c] = saveW
                fb[r][c] = saveB
            }
        }
        return clueKey(fw, fb, n)
    }

    const base = new YYSolver({ size: sizeOf(n), fixedWhites: blank(n), fixedBlacks: blank(n) })
    let live = []
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) live.push([r, c])
    for (const [r, c] of order) {
        const assumptions = [solution.isWhite[r][c] ? Logic.not(cell(r, c)) : cell(r, c)]
        for (const [r2, c2] of live) {
            if (r2 === r && c2 === c) continue
            assumptions.push(solution.isWhite[r2][c2] ? cell(r2, c2) : Logic.not(cell(r2, c2)))
        }
        // solveConnected is TS-private; that is not enforced at runtime.
        if (!base.solveConnected(Logic.and(...assumptions))) {
            live = live.filter(([r2, c2]) => !(r2 === r && c2 === c))
        }
    }
    // Surviving clues keep the colour they had in the original solution.
    const kW = blank(n)
    const kB = blank(n)
    for (const [r, c] of live) {
        if (solution.isWhite[r][c]) kW[r][c] = true
        else kB[r][c] = true
    }
    return { key: clueKey(kW, kB, n), clauses: base.solver.clauses.length }
}

describe.runIf(ENABLED)(`generation profile ${N}x${N}`, () => {
    it('profiles', () => {
        const n = N
        const { solution } = setup(n, SEED)
        const { fw, fb } = cluesOf(solution.isWhite, n)

        log(`\n=== ${n}x${n}, seed ${SEED} ===`)

        reset()
        const construct = ms(() => new YYSolver({ size: sizeOf(n), fixedWhites: fw, fixedBlacks: fb }))
        log(`[construct ] new YYSolver(all ${n * n} clues)     ${construct.ms.toFixed(1)} ms`)

        const realConn = YYSolver.prototype.addConnectivityConstraints
        YYSolver.prototype.addConnectivityConstraints = function noop() { }
        const cheap = ms(() => new YYSolver({ size: sizeOf(n), fixedWhites: fw, fixedBlacks: fb }))
        YYSolver.prototype.addConnectivityConstraints = realConn
        const clauses = new YYSolver({ size: sizeOf(n), fixedWhites: fw, fixedBlacks: fb }).solver.clauses.length
        log(
            `[construct ] without the tree/ring circuit     ${cheap.ms.toFixed(1)} ms  ` +
            `-> connectivity encoding is ${(100 * (construct.ms - cheap.ms) / construct.ms).toFixed(0)}% of construction`,
        )
        log(`[construct ] clause count                     ${clauses}`)

        reset()
        const rs = ms(() => randomSolution(sizeOf(n), mulberry32(SEED + 1)))
        log(`[randomSolution]                              ${rs.ms.toFixed(1)} ms  (${solves} solves)`)

        reset()
        const gen = ms(() => (FAST_ONLY ? null : generateRandomPuzzle(sizeOf(n), SEED)))
        const genSolves = solves
        const genKey = gen.value
            ? clueKey(gen.value.fixedWhites, gen.value.fixedBlacks, n)
            : '(skipped)'
        if (!FAST_ONLY) {
            log(`\n[GENERATE shipped]                            ${gen.ms.toFixed(0)} ms  (${genSolves} solves)  ` +
                `${genKey.replace(/x/g, '').length} clues`)
            log(`  ${(genSolves / (n * n)).toFixed(1)} solves per candidate cell, ${n * n} candidates`)
        }

        reset()
        const pA = ms(() => (FAST_ONLY ? '(skipped)' : removalLoop('fresh', n, SEED)))
        if (!FAST_ONLY) {
            log(`\n[A: fresh solver, 1 solve per candidate]       ${pA.ms.toFixed(0)} ms  (${solves} solves)  ` +
                `${pA.value.replace(/x/g, '').length} clues`)
            log(`  identical clue set to shipped? ${pA.value === genKey}`)
        }

        reset()
        const pB = ms(() => removalLoop('persistent', n, SEED))
        log(`\n[B: ONE persistent solver + clue assumptions]  ${pB.ms.toFixed(0)} ms  (${solves} solves)  ` +
            `${pB.value.key.replace(/x/g, '').length} clues`)
        if (!FAST_ONLY) log(`  identical clue set to shipped? ${pB.value.key === genKey}`)
        if (!FAST_ONLY) log(`  speedup vs shipped: ${(gen.ms / pB.ms).toFixed(1)}x`)
        log(`  clause DB after all candidates: ${pB.value.clauses}`)
        log('')
    }, 3_600_000)
})

describe.runIf(EQUIV)('equivalence of the cheap removal test', () => {
    it('produces the same clue sets as the shipped generator', () => {
        log('\n=== clue-set equivalence (shipped vs persistent-solver) ===')
        // 5, 9 and 11 have an even interior lattice, so the ring case is live.
        const cases = [
            [5, 1], [5, 2], [5, 3],
            [7, 1], [7, 2],
            [9, 1], [9, 2],
            [11, 1],
            [6, 1], [6, 2],
            [8, 1], [8, 2],
            [10, 1], [12, 1],
        ]
        for (const [n, seed] of cases) {
            reset()
            const want = generateRandomPuzzle(sizeOf(n), seed)
            const wantKey = clueKey(want.fixedWhites, want.fixedBlacks, n)
            reset()
            const got = removalLoop('persistent', n, seed)
            const ok = got.key === wantKey
            log(`${n}x${n} seed ${seed}: ${ok ? 'MATCH' : 'DIFFER'}  ` +
                `clues ${wantKey.replace(/x/g, '').length} / ${got.key.replace(/x/g, '').length}`)
            if (!ok) {
                log(`  want ${wantKey}`)
                log(`  got  ${got.key}`)
                throw new Error(`clue set differs at ${n}x${n} seed ${seed}`)
            }
        }
        log('')
    }, 3_600_000)
})

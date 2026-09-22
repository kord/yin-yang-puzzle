/**
 * Per-solve cost breakdown for the current solver.
 *
 * Splits "a solve" into the parts a replacement would actually change:
 *   1. the CDCL search itself        (MiniSat, already int-indexed)
 *   2. model extraction              (one boundary read per variable)
 *   3. the JS wrapper's bookkeeping  (Logic.Solution, Formula cache)
 *   4. number -> name mapping        (getTrueVars: filter + alphabetical sort)
 *   5. the app's decode              (regex per name + a Set)
 *   6. the app's island check        (JS flood fill, twice)
 *
 * Only (1) gets faster by swapping in a modern CDCL core. The rest is interface
 * shape, which any replacement can fix for free.
 *
 *   $env:GEN_OVERHEAD='1'; npx vitest run scratch/solver-overhead.test.js
 */
import { describe, it } from 'vitest'
import { appendFileSync, writeFileSync } from 'node:fs'
import YYSolver from '../src/puzzle/YYSolver'
import { generateRandomPuzzle } from '../src/puzzle/generator'
import { seedFromDateString } from '../src/puzzle/seed'

const ENABLED = !!process.env.GEN_OVERHEAD
const N = Number(process.env.GEN_N || 12)
const REPS = Number(process.env.GEN_REPS || 2000)

const OUT = new URL('./solver-overhead.out.txt', import.meta.url)
writeFileSync(OUT, '')
const log = (...a) => {
    const line = a.join(' ')
    console.log(line)
    appendFileSync(OUT, line + '\n')
}

/** Average microseconds per call. */
const per = (reps, fn) => {
    const t0 = performance.now()
    for (let i = 0; i < reps; i++) fn()
    return ((performance.now() - t0) * 1000) / reps
}

describe.runIf(ENABLED)('solver per-solve overhead', () => {
    it('breaks a solve down', () => {
        const size = { width: N, height: N }
        const puzzle = generateRandomPuzzle(size, seedFromDateString('2026-09-18'))
        const s = new YYSolver(puzzle)
        const solution = s.anySolution()
        if (!solution) throw new Error('expected a solution')

        // Private fields, accessible at runtime.
        const wrapper = s.solver
        const raw = wrapper._minisat

        // Warm up: the first solve flushes every clause into MiniSat.
        wrapper.solve()
        const warm = wrapper.solve()
        const trueVars = warm.getTrueVars()

        const core = per(REPS, () => raw.solve())
        const extractRaw = per(REPS, () => raw.getSolution())
        const wrapperSolve = per(REPS, () => wrapper.solve())
        const solutionAlloc = per(REPS, () => new (Object.getPrototypeOf(warm).constructor)(wrapper, raw.getSolution()))
        const nameMapping = per(REPS, () => warm.getTrueVars())
        const appDecode = per(REPS, () => {
            const names = trueVars
            const whites = new Set(names)
            for (const n of names) n.match(/^cell_(\d+)_(\d+)$/)
            return whites.size
        })
        const islandCheck = per(REPS, () => s.isConnectedSolution(warm))

        const vars = wrapper._num2name.length - 1
        const total = core + extractRaw + nameMapping + appDecode + islandCheck

        log(`\n=== per-solve breakdown, ${N}x${N}, ${vars} variables, ${REPS} reps ===`)
        log(`MiniSat search          ${core.toFixed(1).padStart(8)} us   ${(100 * core / total).toFixed(1)}%`)
        log(`model extraction        ${extractRaw.toFixed(1).padStart(8)} us   ${(100 * extractRaw / total).toFixed(1)}%   (${vars} boundary reads + array)`)
        log(`wrapper solve()         ${wrapperSolve.toFixed(1).padStart(8)} us          (core + decode into Logic.Solution)`)
        log(`  of which new Solution ${solutionAlloc.toFixed(1).padStart(8)} us`)
        log(`number -> name + sort   ${nameMapping.toFixed(1).padStart(8)} us   ${(100 * nameMapping / total).toFixed(1)}%   (getTrueVars)`)
        log(`app decode (regex+Set)  ${appDecode.toFixed(1).padStart(8)} us   ${(100 * appDecode / total).toFixed(1)}%`)
        log(`island check (JS flood) ${islandCheck.toFixed(1).padStart(8)} us   ${(100 * islandCheck / total).toFixed(1)}%`)
        log(`---------------------------------------------`)
        log(`total                   ${total.toFixed(1).padStart(8)} us`)
        log(`search is ${(100 * core / total).toFixed(1)}% of a solve; ${(100 * (total - core) / total).toFixed(1)}% is everything around it`)
        log('')
    }, 600_000)
})

/**
 * Audit generated daily puzzles for *actual* uniqueness, with a connectivity
 * budget far larger than the one `YYSolver.uniqueSolution()` uses internally.
 *
 * The generator trusts `uniqueSolution()`, and that calls `solveConnected` with
 * maxIterations = 500. If the lazy connectivity refutation exhausts that budget
 * it returns null, which the caller reads as "no second solution exists" — so a
 * removal that really does break uniqueness can be kept. This checks the same
 * question with a 200x larger budget, which is a different-enough path to count
 * as independent evidence.
 *
 *   $env:GEN_AUDIT='1'; npx vitest run scratch/daily-audit.test.js
 */
import { describe, it } from 'vitest'
import { appendFileSync, writeFileSync } from 'node:fs'
import Logic from 'logic-solver'
import YYSolver from '../src/puzzle/YYSolver'
import { generateRandomPuzzle } from '../src/puzzle/generator'
import { seedFromDateString } from '../src/puzzle/seed'

const ENABLED = !!process.env.GEN_AUDIT
const DATES = (process.env.GEN_DATES || '2026-09-16,2026-09-17,2026-09-18').split(',')
const N = Number(process.env.GEN_N || 12)
const BIG_BUDGET = 200_000

const OUT = new URL('./daily-audit.out.txt', import.meta.url)
writeFileSync(OUT, '')
const log = (...a) => {
    const line = a.join(' ')
    console.log(line)
    appendFileSync(OUT, line + '\n')
}
const ms = (fn) => {
    const t0 = performance.now()
    const v = fn()
    return { ms: performance.now() - t0, v }
}

const cell = (r, c) => `cell_${r}_${c}`
const render = (isWhite) => isWhite.map((row) => row.map((w) => (w ? 'W' : 'B')).join(''))
const givensRows = (pz) => pz.fixedWhites.map((row, r) =>
    row.map((w, c) => (w ? 'w' : pz.fixedBlacks[r][c] ? 'b' : '.')).join(''))

describe.runIf(ENABLED)('daily puzzle uniqueness audit', () => {
    it('checks each date with an independent, larger solver budget', () => {
        log(`=== ${N}x${N} daily audit, budget ${BIG_BUDGET} ===`)
        for (const date of DATES) {
            const size = { width: N, height: N }
            const seed = seedFromDateString(date)
            const gen = ms(() => generateRandomPuzzle(size, seed))
            const pz = gen.v
            const givenRows = givensRows(pz)
            const clueCount = givenRows.join('').replace(/\./g, '').length

            // The generator's own answer.
            const trusted = new YYSolver(pz).uniqueSolution()
            const trustedRows = trusted ? render(trusted.isWhite) : null

            // Independent check: can any free cell take the other colour, given a
            // much larger refutation budget?
            const s = new YYSolver(pz)
            let counterexample = null
            let probed = 0
            for (let r = 0; r < N && !counterexample; r++) {
                for (let c = 0; c < N && !counterexample; c++) {
                    if (pz.fixedWhites[r][c] || pz.fixedBlacks[r][c]) continue
                    if (!trusted) continue
                    probed++
                    const flip = trusted.isWhite[r][c] ? Logic.not(cell(r, c)) : cell(r, c)
                    const found = s.solveConnected(flip, BIG_BUDGET)
                    if (found) counterexample = render(found.isWhite)
                }
            }

            log(`\n--- ${date} (seed ${seed}) ---`)
            log(`generated in ${gen.ms.toFixed(0)} ms, ${clueCount} clues, free ${N * N - clueCount}`)
            log(`givens:`)
            for (const row of givenRows) log(`  ${row}`)
            log(`generator solution:`)
            for (const row of trustedRows ?? ['(unsolvable)']) log(`  ${row}`)
            log(`independent re-check over ${probed} free cells: ` +
                (counterexample ? 'AMBIGUOUS' : 'unique'))
            if (counterexample) {
                log(`second solution found:`)
                for (const row of counterexample) log(`  ${row}`)
                const diff = counterexample.join('') === (trustedRows ?? []).join('')
                log(`  identical to the generator solution? ${diff}`)
            }
        }
        log('')
    }, 3_600_000)
})

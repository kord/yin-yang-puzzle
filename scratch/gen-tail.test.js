/**
 * How bad is the tail on the biggest daily size?
 *
 * Generation above width 12 has to rebuild the base solver periodically, which
 * costs the accumulated learned clauses. One 16x16 board measured 1.1 s and
 * another 74 s, so a single sample is not enough to decide whether 16x16 is safe
 * to hand a player. This generates one board per date seed and prints each time.
 *
 *   $env:GEN_TAIL='1'; $env:GEN_TAIL_N='16'; npx vitest run scratch/gen-tail.test.js
 */
import { describe, it } from 'vitest'
import { appendFileSync, writeFileSync } from 'node:fs'
import { generateRandomPuzzle } from '../src/puzzle/generator'
import { seedFromDateString } from '../src/puzzle/seed'

const ENABLED = !!process.env.GEN_TAIL
const N = Number(process.env.GEN_TAIL_N || 16)
const DATES = (process.env.GEN_TAIL_DATES ||
    '2026-09-20,2026-09-21,2026-09-22,2026-09-23,2026-09-24,2026-09-25').split(',')

const OUT = new URL('./gen-tail.out.txt', import.meta.url)
writeFileSync(OUT, '')
const log = (...a) => {
    const line = a.join(' ')
    console.log(line)
    appendFileSync(OUT, line + '\n')
}

describe.runIf(ENABLED)(`generation tail at ${N}x${N}`, () => {
    it('times one board per date', () => {
        const times = []
        for (const date of DATES) {
            const t0 = performance.now()
            const puzzle = generateRandomPuzzle({ width: N, height: N }, seedFromDateString(date))
            const ms = Math.round((performance.now() - t0) * 10) / 10
            times.push(ms)
            const clues = puzzle.fixedWhites.flat().filter(Boolean).length +
                puzzle.fixedBlacks.flat().filter(Boolean).length
            log(`${date}  ${String(ms).padStart(9)} ms  ${String(clues).padStart(3)} clues`)
        }
        const sorted = [...times].sort((a, b) => a - b)
        const median = sorted[Math.floor(sorted.length / 2)]
        log(`\nmin ${sorted[0]} ms   median ${median} ms   max ${sorted[sorted.length - 1]} ms`)
        log('')
    }, 3_600_000)
})

/**
 * Times puzzle generation per size, for the README plot.
 *
 * Writes scratch/gen-times.json after every size, so a long run can be watched
 * and the plotting step never has to re-measure.
 *
 *   $env:GEN_TIMES='1'; $env:GEN_TIMES_SIZES='4,6,9,11,13,16'; npx vitest run scratch/gen-times.test.js
 */
import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { generateRandomPuzzle } from '../src/puzzle/generator'
import { seedFromDateString } from '../src/puzzle/seed'

const ENABLED = !!process.env.GEN_TIMES
const SAMPLES = Number(process.env.GEN_TIMES_SAMPLES || 20)
const SIZES = (process.env.GEN_TIMES_SIZES || '4,5,6,7,8,9,10,11,12,13,14,15,16')
    .split(',')
    .map(Number)

const JSON_OUT = new URL('./gen-times.json', import.meta.url)

/** Distinct seeds, in the same shape the app uses for a daily puzzle. */
const seedFor = (n, i) => {
    const day = String(1 + ((i * 3 + n) % 28)).padStart(2, '0')
    const month = String(1 + ((i + n) % 12)).padStart(2, '0')
    return seedFromDateString(`2026-${month}-${day}`)
}

const summarise = (times) => {
    const mean = times.reduce((a, b) => a + b, 0) / times.length
    const variance = times.reduce((a, t) => a + (t - mean) ** 2, 0) / (times.length - 1)
    return {
        mean: Math.round(mean * 100) / 100,
        sd: Math.round(Math.sqrt(variance) * 100) / 100,
        min: Math.min(...times),
        max: Math.max(...times),
    }
}

describe.runIf(ENABLED)('generation times by size', () => {
    it('measures each size', () => {
        // One throwaway run so the first sample does not carry module warm-up.
        const warmupT0 = performance.now()
        generateRandomPuzzle({ width: 6, height: 6 }, seedFor(6, 99))
        const warmupMs = Math.round((performance.now() - warmupT0) * 10) / 10

        const result = {
            samples: SAMPLES,
            warmupMs,
            recordedAt: new Date().toISOString(),
            note: 'milliseconds, one puzzle per seed, warm-up excluded from samples',
            sizes: [],
        }
        writeFileSync(JSON_OUT, JSON.stringify(result, null, 2))

        for (const n of SIZES) {
            const times = []
            for (let i = 0; i < SAMPLES; i++) {
                const t0 = performance.now()
                generateRandomPuzzle({ width: n, height: n }, seedFor(n, i))
                times.push(Math.round((performance.now() - t0) * 10) / 10)
            }
            const stats = summarise(times)
            result.sizes.push({ n, times, ...stats })
            writeFileSync(JSON_OUT, JSON.stringify(result, null, 2))
            console.log(`${n}x${n}`.padEnd(8),
                `mean ${String(stats.mean).padStart(9)} ms  sd ${String(stats.sd).padStart(9)} ms  ` +
                `min ${String(stats.min).padStart(8)}  max ${String(stats.max).padStart(9)}`)
        }
        writeFileSync(JSON_OUT, JSON.stringify(result, null, 2))
    }, 7_200_000)
})

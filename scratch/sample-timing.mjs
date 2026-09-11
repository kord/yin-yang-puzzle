/**
 * How fast is constructive sampling, compared with the solver-based
 * `randomSolution`? Run directly:
 *
 *   node scratch/sample-timing.mjs
 */
import {
    colourFromCracks,
    hamiltonianPathOnInterior,
    isValid,
    mulberry32,
    sampleInterface,
} from './hamiltonian-sampler.mjs'

const K = 20
const pad = (v, w = 10) => String(v).padStart(w)

console.log('board    interior   path build   sample(open)   no-interface  bad-colour  invalid  valid')
for (const m of [6, 8, 10, 12, 14, 16, 18, 20]) {
    const rng = mulberry32(1234 + m)

    let buildMs = 0
    for (let i = 0; i < K; i++) {
        const t0 = performance.now()
        hamiltonianPathOnInterior(m, m, rng)
        buildMs += performance.now() - t0
    }

    let sampleMs = 0
    let noInterface = 0
    let badColour = 0
    let invalid = 0
    let valid = 0
    for (let i = 0; i < K; i++) {
        const t0 = performance.now()
        const cracks = sampleInterface(m, m, rng, 'open', 40)
        sampleMs += performance.now() - t0
        if (!cracks) { noInterface++; continue }
        const colour = colourFromCracks(m, m, cracks)
        if (!colour) { badColour++; continue }
        if (!isValid(colour, m, m)) { invalid++; continue }
        valid++
    }

    console.log(
        `${m}x${m}`.padEnd(9),
        `${m - 1}x${m - 1}`.padEnd(11),
        pad((buildMs / K).toFixed(2) + ' ms'),
        pad((sampleMs / K).toFixed(2) + ' ms'),
        pad(noInterface),
        pad(badColour, 12),
        pad(invalid, 9),
        pad(`${valid}/${K}`, 7),
    )
}

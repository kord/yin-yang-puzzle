/**
 * Spike: can Z3 (prebuilt wasm, no local toolchain) express the Yin-Yang rules
 * CP-style, and what does the same query cost against the current solver?
 *
 * Differences from the logic-solver encoding being tested:
 *   - every cardinality constraint is a *native* PbLe, not an adder circuit
 *   - the clue set is not baked in; it can be passed as temporary assumptions
 *   - the model comes back via Model.eval, which we also time
 *
 *   $env:GEN_Z3='1'; $env:GEN_N='6'; npx vitest run scratch/z3-spike.test.js
 */
import { describe, it } from 'vitest'
import { appendFileSync, writeFileSync } from 'node:fs'
import { init } from 'z3-solver'
import YYSolver from '../src/puzzle/YYSolver'
import { generateRandomPuzzle } from '../src/puzzle/generator'
import { seedFromDateString } from '../src/puzzle/seed'
import { connectedComponents, hasMonochrome2x2, isColorConnected } from '../src/puzzle/rules'

const ENABLED = !!process.env.GEN_Z3
const N = Number(process.env.GEN_N || 6)
const DATE = process.env.GEN_DATE || '2026-09-18'

const OUT = new URL('./z3-spike.out.txt', import.meta.url)
writeFileSync(OUT, '')
const log = (...a) => {
    const line = a.join(' ')
    console.log(line)
    appendFileSync(OUT, line + '\n')
}
const ms = (t0) => Math.round((performance.now() - t0) * 10) / 10

/** Cells as Bool consts, every structural rule as a native PB constraint. */
function buildModel(ctx, n, fixed) {
    const { Bool, Solver, Not, And, Xor, PbLe } = ctx
    const t0 = performance.now()

    const cell = Array.from({ length: n }, (_, r) =>
        Array.from({ length: n }, (_, c) => Bool.const(`c_${r}_${c}`)),
    )

    const allCells = []
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) allCells.push(cell[r][c])

    const whiteEdges = []
    const blackEdges = []
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (c + 1 < n) {
                whiteEdges.push(And(cell[r][c], cell[r][c + 1]))
                blackEdges.push(And(Not(cell[r][c]), Not(cell[r][c + 1])))
            }
            if (r + 1 < n) {
                whiteEdges.push(And(cell[r][c], cell[r + 1][c]))
                blackEdges.push(And(Not(cell[r][c]), Not(cell[r + 1][c])))
            }
        }
    }

    const S = new Solver()
    S.set('timeout', Number(process.env.GEN_Z3_TIMEOUT || 60000))

    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (fixed.white[r][c]) S.add(cell[r][c])
            else if (fixed.black[r][c]) S.add(Not(cell[r][c]))
        }
    }

    // No 2x2 monochrome, and neither checkerboard.
    for (let r = 0; r + 1 < n; r++) {
        for (let c = 0; c + 1 < n; c++) {
            const a = cell[r][c], b = cell[r][c + 1], d = cell[r + 1][c], e = cell[r + 1][c + 1]
            S.add(Not(And(a, b, d, e)))
            S.add(Not(And(Not(a), Not(b), Not(d), Not(e))))
            S.add(Not(And(a, Not(b), Not(d), e)))
            S.add(Not(And(Not(a), b, d, Not(e))))
        }
    }

    // Perimeter: at most two colour transitions, as one PB constraint.
    const per = []
    for (let c = 0; c < n; c++) per.push(cell[0][c])
    for (let r = 1; r < n; r++) per.push(cell[r][n - 1])
    for (let c = n - 2; c >= 0; c--) per.push(cell[n - 1][c])
    for (let r = n - 2; r >= 1; r--) per.push(cell[r][0])
    const transitions = per.map((p, i) => Xor(p, per[(i + 1) % per.length]))
    S.add(PbLe(transitions, transitions.map(() => 1), 2))

    // Each colour's adjacency graph is a tree: n - e = 1, expressed as two PB
    // constraints. Same maths as addConnectivityConstraints, no adder circuit.
    const ones = (k) => new Array(k).fill(1)
    const neg = (k) => new Array(k).fill(-1)
    S.add(PbLe([...allCells, ...whiteEdges], [...ones(allCells.length), ...neg(whiteEdges.length)], 1))
    S.add(PbLe([...allCells, ...whiteEdges], [...neg(allCells.length), ...ones(whiteEdges.length)], -1))
    const blackVars = allCells.map((v) => Not(v))
    S.add(PbLe([...blackVars, ...blackEdges], [...ones(blackVars.length), ...neg(blackEdges.length)], 1))
    S.add(PbLe([...blackVars, ...blackEdges], [...neg(blackVars.length), ...ones(blackEdges.length)], -1))

    return { S, cell, per, buildMs: ms(t0) }
}

const readGrid = (model, cell, n) => {
    const grid = Array.from({ length: n }, () => new Array(n).fill(false))
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) grid[r][c] = model.eval(cell[r][c], true).toString() === 'true'
    }
    return grid
}

/** Same lazy refutation strategy as YYSolver.solveConnected, for a fair compare. */
async function solveConnected(spec, n, assumps, maxIterations = 500) {
    const { S, cell } = spec
    let modelMs = 0
    for (let i = 0; i < maxIterations; i++) {
        const res = await S.check(...assumps)
        if (res !== 'sat') return { grid: null, status: res, iterations: i + 1, modelMs }
        const t0 = performance.now()
        const grid = readGrid(S.model(), cell, n)
        modelMs += performance.now() - t0
        const connected = isColorConnected(grid, true) && isColorConnected(grid, false)
        if (connected) return { grid, status: 'sat', iterations: i + 1, modelMs }
        // Cut: the smallest island of each split colour must change or reconnect.
        const { Or, Not } = spec.ctx
        let cut = false
        for (const white of [true, false]) {
            const comps = connectedComponents(grid, white)
            if (comps.length <= 1) continue
            let smallest = comps[0]
            for (const comp of comps) if (comp.length < smallest.length) smallest = comp
            const inIsland = new Set(smallest.map(([r, c]) => r * n + c))
            const lits = []
            for (const [r, c] of smallest) lits.push(white ? Not(cell[r][c]) : cell[r][c])
            for (const [r, c] of smallest) {
                for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nr = r + dr, nc = c + dc
                    if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue
                    if (inIsland.has(nr * n + nc)) continue
                    lits.push(white ? cell[nr][nc] : Not(cell[nr][nc]))
                }
            }
            S.add(Or(...lits))
            cut = true
        }
        if (!cut) return { grid: null, status: 'unreachable', iterations: i + 1, modelMs }
    }
    return { grid: null, status: 'iteration-cap', iterations: maxIterations, modelMs }
}

const render = (grid) => grid.map((row) => row.map((w) => (w ? 'W' : 'B')).join(''))

describe.runIf(ENABLED)(`z3 spike ${N}x${N}`, () => {
    it('solves the same daily instance', async () => {
        const size = { width: N, height: N }
        const puzzle = generateRandomPuzzle(size, seedFromDateString(DATE))
        const fixed = { white: puzzle.fixedWhites, black: puzzle.fixedBlacks }
        const clues = puzzle.fixedWhites.flat().filter(Boolean).length +
            puzzle.fixedBlacks.flat().filter(Boolean).length

        log(`\n=== ${N}x${N}, ${DATE}, ${clues} clues ===`)

        // --- current solver, identical question -----------------------------
        const tA = performance.now()
        const yy = new YYSolver(puzzle)
        const yySolution = yy.anySolution()
        const yyMs = ms(tA)

        // --- z3 ------------------------------------------------------------
        const tInit = performance.now()
        const { Context } = await init()
        const ctx = Context('spike')
        const initMs = ms(tInit)

        const tBuild = performance.now()
        const spec = buildModel(ctx, N, fixed)
        const withCtx = { ...spec, ctx }
        const buildMs = ms(tBuild)

        const tSolve = performance.now()
        const first = await solveConnected(withCtx, N, [])
        const firstMs = ms(tSolve)

        // Alternative extraction: one crossing for the whole model.
        const tStr = performance.now()
        const modelString = spec.S.model().toString()
        const strMs = ms(tStr)

        let warmMs = null
        if (N <= 8) {
            const tWarm = performance.now()
            await solveConnected({ ...buildModel(ctx, N, fixed), ctx }, N, [])
            warmMs = ms(tWarm)
        }

        const stats = [...spec.S.statistics()].map((e) => `${e.key}=${e.value}`).join(' ')

        log(`YYSolver  (build+solve)   ${String(yyMs).padStart(8)} ms`)
        log(`z3 init()                 ${String(initMs).padStart(8)} ms`)
        log(`z3 build (JS->Z3)         ${String(buildMs).padStart(8)} ms`)
        log(`z3 first check            ${String(firstMs).padStart(8)} ms  (${first.iterations} iterations, status ${first.status})`)
        if (warmMs !== null) log(`z3 fresh build+solve      ${String(warmMs).padStart(8)} ms`)
        log(`z3 model via Model.eval   ${String(Math.round(first.modelMs * 10) / 10).padStart(8)} ms  (${N * N} evals)`)
        log(`z3 model via toString()   ${String(strMs).padStart(8)} ms  (${modelString.length} chars, one crossing)`)
        if (stats) log(`z3 statistics             ${stats}`)

        const grid = first.grid
        if (!grid) {
            log(`z3: no connected model (status ${first.status})`)
            log('')
            return
        }
        const valid = !hasMonochrome2x2(grid) && isColorConnected(grid, true) && isColorConnected(grid, false)
        log(`z3 model valid Yin-Yang:  ${valid}`)
        log(`z3 solution:`)
        for (const row of render(grid)) log(`  ${row}`)
        if (yySolution) {
            log(`current solver solution:`)
            for (const row of render(yySolution.isWhite)) log(`  ${row}`)
            log(`same board? ${render(grid).join('') === render(yySolution.isWhite).join('')}`)
        }
        log('')
    }, 1_800_000)
})

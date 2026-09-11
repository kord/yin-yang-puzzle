/**
 * If a Yin-Yang solution IS a Hamiltonian path/cycle on the interior lattice
 * (see interface-structure.mjs and the README), then we can stop *searching*
 * for solutions and just build one:
 *
 *   1. sample a Hamiltonian structure on the (m-1) x (n-1) grid of interior
 *      lattice points - either an open path whose two endpoints are on the
 *      border of that grid (needed so the interface reaches the board edge),
 *      or a cycle;
 *   2. take its edges as the interface cracks;
 *   3. 2-colour the cells across those cracks.
 *
 * The result is a valid Yin-Yang by construction, with no SAT involved. That is
 * the inverse of what the generator does today: draw random seeds and reject
 * until the solver returns a valid board.
 *
 * It also measures the "wrap" case - a closed interface, where one colour class
 * contains the boundary cycle. Those are genuine solutions, but YYSolver's hard
 * `verts == edges + 1` tree constraint cannot represent them.
 *
 * Run:  node scratch/hamiltonian-sampler.mjs
 */

const SAMPLES = 400
const SEARCH_BUDGET = 200000

/** Deterministic RNG, so the output is reproducible. */
function mulberry32(seed) {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6D2B79F5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** A Hamiltonian path on the interior lattice grid (R x C points, R=m-1, C=n-1). */
function hamiltonianPathOnInterior(m, n, rng) {
    const R = m - 1
    const C = n - 1
    const N = R * C
    if (N === 0) return null

    const adj = []
    const onBorder = new Uint8Array(N)
    for (let p = 0; p < N; p++) {
        const i = (p / C) | 0
        const j = p % C
        const list = []
        if (i > 0) list.push(p - C)
        if (i < R - 1) list.push(p + C)
        if (j > 0) list.push(p - 1)
        if (j < C - 1) list.push(p + 1)
        adj.push(list)
        if (i === 0 || i === R - 1 || j === 0 || j === C - 1) onBorder[p] = 1
    }

    const used = new Uint8Array(N)
    const path = []
    let steps = 0
    const onward = (v, from) => adj[v].filter((w) => !used[w] && w !== from).length

    const dfs = (cur) => {
        used[cur] = 1
        path.push(cur)
        if (path.length === N) return true
        const cand = adj[cur].filter((v) => !used[v])
        // Warnsdorff ordering with jitter: fewest onward moves first. This is
        // what makes naive backtracking finish at these sizes.
        cand.sort((a, b) => (onward(a, cur) - onward(b, cur)) + (rng() - 0.5))
        for (const v of cand) {
            if (++steps > SEARCH_BUDGET) break
            if (dfs(v)) return true
        }
        path.pop()
        used[cur] = 0
        return false
    }

    if (!dfs(Math.floor(rng() * N))) return null
    return { path, onBorder, R, C }
}

// ---------------------------------------------------------------------------
// lattice <-> cell bookkeeping
//
// Cell (r,c) occupies [r,r+1] x [c,c+1]; lattice points (i,j) have 0<=i<=m,
// 0<=j<=n. So:
//   vertical   lattice edge (i,j)-(i+1,j) separates cells (i,j-1) and (i,j)
//   horizontal lattice edge (i,j)-(i,j+1) separates cells (i-1,j) and (i,j)
// ---------------------------------------------------------------------------

const cellPairKey = (a, b) => (a < b ? a + ':' + b : b + ':' + a)

/** The two cells separated by a lattice edge, as cell indices. */
function cellsSplitByLatticeEdge(m, n, i1, j1, i2, j2) {
    if (j1 === j2) {
        const i = Math.min(i1, i2)
        return [i * n + (j1 - 1), i * n + j1]
    }
    const j = Math.min(j1, j2)
    return [(i1 - 1) * n + j, i1 * n + j]
}

/** Crack set for an interface: interior edges plus either 2 boundary stubs or a closing edge. */
function cracksForInterface(m, n, spec, mode, rng) {
    const { path, C } = spec
    const cracks = new Set()
    const lat = (p) => [((p / C) | 0) + 1, (p % C) + 1]

    const addLatticeEdge = (a, b) => {
        const [i1, j1] = lat(a)
        const [i2, j2] = lat(b)
        const [ca, cb] = cellsSplitByLatticeEdge(m, n, i1, j1, i2, j2)
        cracks.add(cellPairKey(ca, cb))
    }

    for (let k = 0; k + 1 < path.length; k++) addLatticeEdge(path[k], path[k + 1])

    if (mode === 'cycle') {
        addLatticeEdge(path[path.length - 1], path[0])
        return cracks
    }

    // Open path: each end needs one boundary lattice neighbour. An endpoint on
    // the border of the interior grid may have several; pick one at random.
    for (const end of [path[0], path[path.length - 1]]) {
        const [i, j] = lat(end)
        const options = []
        if (i === 1) options.push([[0, j], [1, j]])
        if (i === m - 1) options.push([[m - 1, j], [m, j]])
        if (j === 1) options.push([[i, 0], [i, 1]])
        if (j === n - 1) options.push([[i, n - 1], [i, n]])
        if (!options.length) return null
        const pick = options[Math.floor(rng() * options.length)]
        const [ca, cb] = cellsSplitByLatticeEdge(m, n, pick[0][0], pick[0][1], pick[1][0], pick[1][1])
        cracks.add(cellPairKey(ca, cb))
    }
    return cracks
}

/** Colour the cells by BFS across the cracks: equal within a region, opposite across one. */
function colourFromCracks(m, n, cracks) {
    const colour = new Int8Array(m * n).fill(-1)
    colour[0] = 0
    const stack = [0]
    while (stack.length) {
        const i = stack.pop()
        const r = (i / n) | 0
        const c = i % n
        const neighbours = []
        if (c + 1 < n) neighbours.push(r * n + c + 1)
        if (c > 0) neighbours.push(r * n + c - 1)
        if (r + 1 < m) neighbours.push((r + 1) * n + c)
        if (r > 0) neighbours.push((r - 1) * n + c)
        for (const j of neighbours) {
            const want = cracks.has(cellPairKey(i, j)) ? 1 - colour[i] : colour[i]
            if (colour[j] === -1) {
                colour[j] = want
                stack.push(j)
            } else if (colour[j] !== want) {
                return null // inconsistent, i.e. not a simple interface
            }
        }
    }
    return colour
}

/**
 * Sample an interface of the requested kind, retrying until the Hamiltonian
 * structure actually fits. An open path needs both endpoints on the border of
 * the interior grid (so the interface can reach the board edge); a cycle needs
 * its two ends to be lattice-adjacent (otherwise the closing edge is not a real
 * crack and the colouring comes out inconsistent).
 */
function sampleInterface(m, n, rng, mode, tries) {
    for (let t = 0; t < tries; t++) {
        const spec = hamiltonianPathOnInterior(m, n, rng)
        if (!spec) return null
        const { path, onBorder, C } = spec
        const first = path[0]
        const last = path[path.length - 1]
        if (mode === 'open') {
            if (!onBorder[first] || !onBorder[last]) continue
        } else {
            const adjacent =
                Math.abs(((first / C) | 0) - ((last / C) | 0)) +
                Math.abs((first % C) - (last % C)) === 1
            if (!adjacent) continue
        }
        const cracks = cracksForInterface(m, n, spec, mode, rng)
        if (cracks) return cracks
    }
    return null
}

// ---------------------------------------------------------------------------
// checks
// ---------------------------------------------------------------------------

function isValid(colour, m, n) {
    for (let r = 0; r + 1 < m; r++) {
        for (let c = 0; c + 1 < n; c++) {
            const a = colour[r * n + c], b = colour[r * n + c + 1]
            const d = colour[(r + 1) * n + c], e = colour[(r + 1) * n + c + 1]
            if (a === b && b === d && d === e) return false
        }
    }
    const connected = (want) => {
        let start = -1
        let total = 0
        for (let i = 0; i < m * n; i++) if (colour[i] === want) { total++; if (start < 0) start = i }
        if (start < 0) return true
        const seen = new Set([start])
        const st = [start]
        while (st.length) {
            const i = st.pop()
            const r = (i / n) | 0, c = i % n
            for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
                if (nr < 0 || nr >= m || nc < 0 || nc >= n) continue
                const j = nr * n + nc
                if (colour[j] === want && !seen.has(j)) { seen.add(j); st.push(j) }
            }
        }
        return seen.size === total
    }
    return connected(0) && connected(1)
}

const rowsOf = (colour, m, n) => Array.from({ length: m }, (_, r) =>
    Array.from({ length: n }, (_, c) => (colour[r * n + c] ? 'W' : 'B')).join(''))

// ---------------------------------------------------------------------------

const rng = mulberry32(20260912)
const sizes = [[4, 4], [5, 5], [6, 6], [8, 8], [10, 10]]

console.log('grid      open path: built / valid     cycle: built / valid     inconsistent')
for (const [m, n] of sizes) {
    const stats = {
        open: { built: 0, valid: 0, example: null },
        cycle: { built: 0, valid: 0, example: null },
        inconsistent: 0,
    }

    for (let s = 0; s < SAMPLES; s++) {
        const mode = s % 2 === 0 ? 'open' : 'cycle'
        const cracks = sampleInterface(m, n, rng, mode, 40)
        if (!cracks) continue
        stats[mode].built++

        const colour = colourFromCracks(m, n, cracks)
        if (!colour || !isValid(colour, m, n)) { stats.inconsistent++; continue }
        stats[mode].valid++
        if (!stats[mode].example) stats[mode].example = rowsOf(colour, m, n)
    }

    console.log(
        `${m}x${n}`.padEnd(10),
        `${stats.open.built} / ${stats.open.valid}`.padEnd(31),
        `${stats.cycle.built} / ${stats.cycle.valid}`.padEnd(29),
        String(stats.inconsistent),
    )

    if (m === n) {
        for (const mode of ['open', 'cycle']) {
            if (!stats[mode].example) continue
            const label = mode === 'open'
                ? 'open path - both classes are trees, solver can represent it'
                : 'cycle - wrap case, solver cannot see it'
            console.log(`   ${m}x${n} ${label}:`)
            for (const row of stats[mode].example) console.log('     ' + row)
        }
    }
}

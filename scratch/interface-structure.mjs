/**
 * Two independent enumerations of small Yin-Yang puzzles, to test a structural
 * claim I derived by hand:
 *
 *   CLAIM. In any valid Yin-Yang on an m x n rectangle, the set of "cracks"
 *   (edges between a black cell and a white cell), viewed as a subgraph of the
 *   lattice of cell corners, has degree EXACTLY 2 at every strictly interior
 *   lattice point. Consequently no valid solution ever contains a checkerboard
 *   2x2 block, and the interface is a single simple curve: a Hamiltonian path
 *   or cycle through all (m-1)(n-1) interior lattice points.
 *
 * Why the claim matters: it says the puzzle is exactly "find a Hamiltonian path
 * in the interior lattice grid, with both ends on the boundary".
 *
 * The hand argument:
 *   Let H be the crack subgraph and R the rectangle boundary. A crack between
 *   two cells is present iff those cells differ in colour, so around any 2x2
 *   block the number of colour changes is even (you return to the starting
 *   colour), i.e. every interior lattice point has degree 0, 2 or 4. Degree 0
 *   is exactly a monochrome 2x2 block, so "no monochrome 2x2" <=> every
 *   interior point has degree >= 1 <=> degree is 2 or 4.
 *
 *   Both colours connected <=> R \ H has exactly 2 regions (regions of R \ H
 *   are exactly the monochrome connected components), which with the boundary
 *   gives F = 3 faces for the planar graph H + dR. Euler on the sphere:
 *   V - E + F = 1 + C, where C = 1 + #components(H) or 1 depending on whether
 *   H touches the boundary.
 *
 *     Case A (H meets dR, so C = 1):
 *       E_H = (m-1)(n-1) + 1
 *       sum of degrees = 2*E_H = 2(m-1)(n-1) + 2
 *       Boundary lattice points have degree <= 1 (a non-corner boundary point
 *       has exactly one incident crack), so at most 2 of them can be touched,
 *       and every one of the (m-1)(n-1) interior points has degree >= 2. The
 *       count only balances if every interior point has degree EXACTLY 2.
 *
 *     Case B (H does not meet dR, so C = 1 + c):
 *       E_H = (m-1)(n-1) + 2 - C = (m-1)(n-1) + 1 - c
 *       the same bound forces c <= 1, and c = 1 again pins every interior
 *       point to degree exactly 2 (H is then a cycle through all of them).
 *
 * So degree 4 — a checkerboard 2x2 — is impossible.
 *
 * Enumeration 1 checks the claim directly (degree histogram, checkerboard count).
 * Enumeration 2 counts Hamiltonian paths/cycles on the interior lattice graph
 * WITHOUT looking at colourings at all, and we compare the totals: each
 * Hamiltonian structure should correspond to exactly 2 colourings (the two
 * choices of which side is black).
 *
 * Run:  node scratch/interface-structure.mjs
 */

const BUDGET_MS = 25000

// ---------------------------------------------------------------------------
// Enumeration 1: every valid colouring, by brute force
// ---------------------------------------------------------------------------

/** Cell (r,c) is the square [r,r+1] x [c,c+1]; true = white. */
function allColourings(m, n, budgetMs) {
    const N = m * n
    const g = new Uint8Array(N)
    const t0 = Date.now()
    const out = {
        count: 0,
        withCheckerboard: 0,
        degreeHistogram: new Map(),
        truncated: false,
        treeStats: { bothTrees: 0, nonTreeIsBoundary: 0, other: 0, violatesTreeConstraint: 0, violatesBorderRule: 0, maxPerimeterTransitions: 0 },
    }

    const connected = (color) => {
        let start = -1
        let total = 0
        for (let i = 0; i < N; i++) {
            if (g[i] === color) {
                total++
                if (start < 0) start = i
            }
        }
        if (start < 0) return true // colour unused
        const seen = new Uint8Array(N)
        seen[start] = 1
        const st = [start]
        let seenCount = 0
        while (st.length) {
            const i = st.pop()
            seenCount++
            const r = (i / n) | 0
            const c = i % n
            if (r > 0 && g[i - n] === color && !seen[i - n]) { seen[i - n] = 1; st.push(i - n) }
            if (r < m - 1 && g[i + n] === color && !seen[i + n]) { seen[i + n] = 1; st.push(i + n) }
            if (c > 0 && g[i - 1] === color && !seen[i - 1]) { seen[i - 1] = 1; st.push(i - 1) }
            if (c < n - 1 && g[i + 1] === color && !seen[i + 1]) { seen[i + 1] = 1; st.push(i + 1) }
        }
        return seenCount === total
    }

    /**
     * Degree of the interior lattice point (i,j), 1 <= i <= m-1, 1 <= j <= n-1.
     * Its four incident cracks are exactly the four adjacencies of the 2x2 block
     * of cells with top-left corner (i-1, j-1).
     */
    const interiorDegree = (i, j) => {
        const a = g[(i - 1) * n + (j - 1)]
        const b = g[(i - 1) * n + j]
        const d = g[i * n + (j - 1)]
        const e = g[i * n + j]
        return (a !== b ? 1 : 0) + (d !== e ? 1 : 0) + (a !== d ? 1 : 0) + (b !== e ? 1 : 0)
    }

    /** Vertex and edge counts of the induced subgraph on the cells of `color`. */
    const classEdgeStats = (color) => {
        let verts = 0
        let edges = 0
        for (let r = 0; r < m; r++) {
            for (let c = 0; c < n; c++) {
                if (g[r * n + c] !== color) continue
                verts++
                if (c + 1 < n && g[r * n + c + 1] === color) edges++
                if (r + 1 < m && g[(r + 1) * n + c] === color) edges++
            }
        }
        return { verts, edges }
    }

    /**
     * The per-colour TREE CONSTRAINT that src/puzzle/YYSolver.ts requires of every
     * model: verts == edges + 1 for each colour. The class must already be
     * connected for this to be a tree test, and it is (checked in finish()).
     */
    const satisfiesTreeConstraint = (color) => {
        const { verts, edges } = classEdgeStats(color)
        return verts === 0 || verts === edges + 1
    }

    /** Colour changes walking the perimeter as a closed loop (YYSolver's border rule). */
    const perimeterTransitions = () => {
        const per = []
        for (let c = 0; c < n; c++) per.push([0, c])
        for (let r = 1; r < m; r++) per.push([r, n - 1])
        for (let c = n - 2; c >= 0; c--) per.push([m - 1, c])
        for (let r = m - 2; r >= 1; r--) per.push([r, 0])
        let t = 0
        for (let i = 0; i < per.length; i++) {
            const a = g[per[i][0] * n + per[i][1]]
            const b0 = per[(i + 1) % per.length]
            const b = g[b0[0] * n + b0[1]]
            if (a !== b) t++
        }
        return t
    }

    const isBoundaryCell = (r, c) => r === 0 || c === 0 || r === m - 1 || c === n - 1

    /**
     * The paper is precise about the *cycle*, not about the class: the unique
     * cycle of the offending colour class must be exactly the boundary ring, and
     * the class may additionally carry trees hanging off that ring. So strip
     * degree-1 cells repeatedly; whatever survives is the 2-core, i.e. the union
     * of the class's cycles.
     */
    const cycleIsBoundaryRing = (color) => {
        const alive = new Uint8Array(m * n)
        for (let i = 0; i < m * n; i++) if (g[i] === color) alive[i] = 1
        for (; ;) {
            const doomed = []
            for (let r = 0; r < m; r++) {
                for (let c = 0; c < n; c++) {
                    const i = r * n + c
                    if (!alive[i]) continue
                    let deg = 0
                    if (r > 0 && alive[i - n]) deg++
                    if (r < m - 1 && alive[i + n]) deg++
                    if (c > 0 && alive[i - 1]) deg++
                    if (c < n - 1 && alive[i + 1]) deg++
                    if (deg <= 1) doomed.push(i)
                }
            }
            if (!doomed.length) break
            for (const i of doomed) alive[i] = 0
        }
        for (let r = 0; r < m; r++) {
            for (let c = 0; c < n; c++) {
                if (alive[r * n + c] !== (isBoundaryCell(r, c) ? 1 : 0)) return false
            }
        }
        return true
    }

    const finish = () => {
        if (!connected(1) || !connected(0)) return
        out.count++
        let checkerboards = 0
        for (let i = 1; i <= m - 1; i++) {
            for (let j = 1; j <= n - 1; j++) {
                const deg = interiorDegree(i, j)
                out.degreeHistogram.set(deg, (out.degreeHistogram.get(deg) ?? 0) + 1)
                if (deg === 4) checkerboards++
            }
        }
        if (checkerboards > 0) out.withCheckerboard++

        // Demaine et al. claim each colour class is an induced TREE, except for
        // the single allowed exception of one class being the boundary ring.
        const blackTree = satisfiesTreeConstraint(0)
        const whiteTree = satisfiesTreeConstraint(1)
        if (!blackTree || !whiteTree) out.treeStats.violatesTreeConstraint++

        const transitions = perimeterTransitions()
        if (transitions > out.treeStats.maxPerimeterTransitions) {
            out.treeStats.maxPerimeterTransitions = transitions
        }
        if (transitions > 2) out.treeStats.violatesBorderRule++
        if (blackTree && whiteTree) {
            out.treeStats.bothTrees++
        } else if ((!blackTree && cycleIsBoundaryRing(0)) || (!whiteTree && cycleIsBoundaryRing(1))) {
            out.treeStats.nonTreeIsBoundary++
        } else {
            out.treeStats.other++
            if (!out.treeStats.otherExample) {
                out.treeStats.otherExample = {
                    rows: Array.from({ length: m }, (_, r) =>
                        Array.from({ length: n }, (_, c) => (g[r * n + c] ? 'W' : 'B')).join('')),
                    blackTree,
                    whiteTree,
                }
            }
        }
    }

    const rec = (i) => {
        if (out.truncated) return
        if (Date.now() - t0 > budgetMs) { out.truncated = true; return }
        if (i === N) { finish(); return }
        const r = (i / n) | 0
        const c = i % n
        for (let v = 0; v < 2; v++) {
            g[i] = v
            // prune as soon as a completed 2x2 block is monochrome
            if (r > 0 && c > 0) {
                const a = g[i - n - 1], b = g[i - n], d = g[i - 1], e = g[i]
                if (a === b && b === d && d === e) continue
            }
            rec(i + 1)
            if (out.truncated) return
        }
    }
    rec(0)
    return out
}

// ---------------------------------------------------------------------------
// Enumeration 2: Hamiltonian paths / cycles on the interior lattice graph
// ---------------------------------------------------------------------------

function interfaceStructures(m, n, budgetMs) {
    const W = n + 1
    const H = m + 1
    const vid = (i, j) => i * W + j
    const total = W * H

    const adj = Array.from({ length: total }, () => [])
    for (let i = 0; i < H; i++) {
        for (let j = 0; j < W; j++) {
            const v = vid(i, j)
            if (i > 0) adj[v].push(vid(i - 1, j))
            if (i < H - 1) adj[v].push(vid(i + 1, j))
            if (j > 0) adj[v].push(vid(i, j - 1))
            if (j < W - 1) adj[v].push(vid(i, j + 1))
        }
    }

    // strictly interior lattice points
    const interior = []
    const isInterior = new Uint8Array(total)
    for (let i = 1; i < H - 1; i++) {
        for (let j = 1; j < W - 1; j++) {
            isInterior[vid(i, j)] = 1
            interior.push(vid(i, j))
        }
    }

    // how many boundary lattice points each interior point may attach to
    const bdeg = new Map()
    for (const v of interior) bdeg.set(v, 0)
    for (let v = 0; v < total; v++) {
        if (isInterior[v]) continue
        for (const nb of adj[v]) {
            if (isInterior[nb]) bdeg.set(nb, bdeg.get(nb) + 1)
        }
    }

    const K = interior.length
    const t0 = Date.now()
    const state = { stopped: false, pathSum: 0, cycles: 0 }
    const used = new Uint8Array(total)

    const dfs = (cur, first, depth) => {
        if (state.stopped) return
        if (Date.now() - t0 > budgetMs) { state.stopped = true; return }
        if (depth === K) {
            // open path: pick a boundary endpoint for each end
            state.pathSum += bdeg.get(first) * bdeg.get(cur)
            // closed cycle: no boundary endpoints needed
            if (adj[cur].includes(first)) state.cycles++
            return
        }
        for (const nb of adj[cur]) {
            if (!isInterior[nb] || used[nb]) continue
            used[nb] = 1
            dfs(nb, first, depth + 1)
            used[nb] = 0
            if (state.stopped) return
        }
    }

    for (const v of interior) {
        used[v] = 1
        dfs(v, v, 1)
        used[v] = 0
        if (state.stopped) break
    }

    // each undirected path was enumerated twice (once from each end);
    // each undirected cycle 2K times (K rotations x 2 directions)
    const structures = state.pathSum / 2 + (K > 0 ? state.cycles / (2 * K) : 0)
    return { interiorPoints: K, structures, predictedColourings: 2 * structures, truncated: state.stopped }
}

// ---------------------------------------------------------------------------

const sizes = [[3, 3], [3, 4], [4, 4], [4, 5], [5, 5]]
const results = sizes.map(([m, n]) => ({
    m, n,
    c: allColourings(m, n, BUDGET_MS),
    s: interfaceStructures(m, n, BUDGET_MS),
}))

const degreeCounts = (c) => [...c.degreeHistogram.entries()].sort((a, b) => a[0] - b[0])
    .map(([deg, count]) => `${deg}:${count}`).join(' ')
const agrees = ({ c, s }) => c.count === s.predictedColourings && !c.truncated && !s.truncated

console.log('grid   colourings(checkerboard)  degree counts   Ham structures  2 x that  match')
for (const { m, n, c, s } of results) {
    console.log(
        `${m}x${n}`.padEnd(7),
        `${c.count} (${c.withCheckerboard})`.padEnd(28),
        degreeCounts(c).padEnd(16),
        String(s.structures).padEnd(15),
        String(s.predictedColourings).padEnd(9),
        agrees({ c, s }) ? 'YES' : 'no',
    )
}

console.log('')
console.log("Does the app's hard constraint set reject any genuine solution?")
console.log('grid   valid colourings   tree rule    border rule    max perimeter transitions')
for (const { m, n, c } of results) {
    const t = c.treeStats
    console.log(
        `${m}x${n}`.padEnd(7),
        String(c.count).padEnd(18),
        String(t.violatesTreeConstraint).padEnd(13),
        String(t.violatesBorderRule).padEnd(15),
        String(t.maxPerimeterTransitions),
    )
}

for (const { m, n, c } of results) {
    const t = c.treeStats
    if (!t.otherExample) continue
    console.log('')
    console.log(`Unexplained non-tree colour class on ${m}x${n} (neither a tree nor a boundary ring):`)
    for (const row of t.otherExample.rows) console.log('   ' + row)
}

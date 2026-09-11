# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

# Some interesting puzzles

[9x9](https://yinyang.therestinmotion.com/?p=m60p9GKhHsjhwDpapRD9idVbbAWZGN_)
[]()

# Yin-Yang: annotated literature

## The result

**Yin-Yang Puzzles are NP-complete.** Erik D. Demaine, Jayson Lynch, Mikhail Rudoy, Yushi Uno.
CCCG 2021. [arXiv:2106.15585](https://arxiv.org/abs/2106.15585)

The rules they analyse are exactly the two this app implements — each colour a single
4-connected group, and no 2×2 block of one colour — and they prove NP-completeness *with and
without* the 2×2 rule. So "is this clue set solvable?" is NP-complete.

Two reformulations from their §1.1 are worth carrying around, because they say what the puzzle
actually is. With both rules (and the caveat below) it is equivalent to partitioning a
rectangular grid graph into two induced **trees**; without the 2×2 rule, into two induced
**connected** subgraphs. Both are completion problems — some vertices pre-assigned — which is
exactly what a clue set is.

The reduction is *not* from SAT. It is from **Planar 4-Regular Tree-Residue Vertex Breaking**
(TRVB): given a planar 4-regular multigraph, is there a set of vertices to "break" that leaves a
single tree? Take an orthogonal grid drawing, scale by 16, drop in vertex and edge gadgets on a
background filler. The edge gadgets are literally wires — chains of black cells — so the
instinct "build wires and a vertex gadget" is right; the source problem is just a graph-drawing
one rather than logic gates.

## The lemma that does the work

**Lemma 2.1** — no 2×2 can contain diagonally opposite circles of different colours, i.e. a
checkerboard 2×2 is impossible. It follows from connectivity alone by planarity: each colour's
diagonal pair must be joined by a path, and the two paths cannot avoid crossing.

There is a restatement that is easier to reason with. Call the **interface** the set of cell
adjacencies where the two cells differ in colour:

- the four cracks around an interior lattice point form a 4-cycle of cells, and walking it
  returns you to the starting colour, so that point's interface-degree is 0, 2 or 4;
- degree 0 *is* a monochrome 2×2, so the 2×2 rule says degree ≥ 1;
- Lemma 2.1 says degree ≠ 4.

So every interior lattice point has interface-degree exactly 2, and the interface is one simple
curve passing through all of them: a **Hamiltonian path or cycle on the interior lattice grid**,
with a path's two ends on the boundary. A cycle means one colour encloses the other.

That is a restatement of their Lemma 2.1 plus the 2×2 rule rather than a new result, but it is
the form in which the hardness feels inevitable — Hamiltonicity in grid graphs is NP-complete
too, so the puzzle is carrying that problem inside it.

`scratch/interface-structure.mjs` brute-forces all of this (`node scratch/interface-structure.mjs`).
It enumerates every valid colouring and, independently, every Hamiltonian path/cycle on the
interior lattice graph:

```
grid   colourings(checkerboard)  degree counts   Ham structures  2 x that  match
3x3     34 (0)                       2:136            17              34        YES
3x4     50 (0)                       2:300            25              50        YES
4x4     96 (0)                       2:864            48              96        YES
4x5     220 (0)                      2:2640           110             220       YES
5x5     660 (0)                      2:10560          330             660       YES
```

No checkerboard ever appears, the only interface-degree observed is 2, and
#colourings = 2 × #structures exactly — the 2 being the choice of which side is black. The 4×4
count of 96 agrees with the figure recorded elsewhere in this repo.

## The exception, and the bug it explains

A colour class is **not** always a tree. In a 3×3 with a single white centre cell, the black
class is the boundary ring — an 8-cycle. The paper carves this out exactly: the unique cycle of a
colour class must be *the boundary ring* (the class may also carry trees hanging off it), and
they dodge it in their reduction by precolouring a boundary cell of each colour. The brute force
confirms the exception is this narrow and no wider — on 4×5 and 5×5, every non-tree class has the
boundary ring as its 2-core with pendants attached.

**This matters here.** `src/puzzle/YYSolver.ts` requires, as a hard constraint, `vertices ==
edges + 1` for each colour — the paper's tree-partition characterisation, applied without their
boundary caveat:

```
Does the app's hard constraint set reject any genuine solution?
grid   valid colourings   tree rule    border rule    max perimeter transitions
3x3     34                 2             0               2
3x4     50                 2             0               2
4x4     96                 0             0               2
4x5     220                4             0               2
5x5     660                12            0               2
```

The rejections were exactly the boundary-ring solutions, so the solver could not see any solution
whose interface closes into a loop — one colour surrounding the other. Reproduced before the fix:
in design mode on a 5×5, filling in the wrap solution below except for the centre cell reported
**`No solution`**, with a solution sitting on the board. After the fix the same board reports
**`Unique solution`** and the Share button enables.

```
BBBBB
BWBWB
BWWWB   <- centre cell left empty
BWBWB
BBBBB
```

It was a *capability* bug rather than a correctness one. `randomSolution` only ever accepts boards
that the solver returns, and the solver could not return a wrap case, so generated puzzles were
never wrap cases — no player was ever handed a puzzle the solver disagreed with. What it cost was
that design mode refused to certify such puzzles, the Share gate (which requires `unique`) refused
to share them, and the generator could not produce them at all.

Which sizes are exposed? A wrap solution needs a closed interface, i.e. a Hamiltonian *cycle* on
the (m-1) × (n-1) interior lattice, and a p × q grid graph is Hamiltonian-cyclic only if p·q is
even. So for square boards it is the **odd** sizes: 5×5, 7×7, 9×9, 11×11, and not 4×4, 6×6, 8×8,
10×10. The sampler below lands on exactly this — cycle sampling succeeds on 5×5 and fails on every
even size.

## The fix

`addConnectivityConstraints` now requires a disjunction over three cases instead of the tree count
alone: both classes are trees, or every boundary cell is white (that class then carries exactly one
cycle, so `n = e`, while black stays a tree), or every boundary cell is black (symmetric). The
disjunction is only built when the ring case is possible at all — `(h-1), (w-1) >= 2` with an even
product, the parity condition above.

The gating matters for more than speed. On boards where the exception cannot occur, the constraint
is issued exactly as it always was: two separate `require` calls, in the original order. Bundling
them into a single conjunction is semantically identical but changes MiniSat's clause order, and
therefore *which* valid solution is found first — doing so silently regenerated all three locked
12×12 daily puzzles. Keeping the clause shape leaves the even-sized boards byte-for-byte unchanged,
which `dailyPuzzle.test.ts` verifies.

Regression coverage lives in `src/puzzle/YYSolver.test.ts` under "the boundary-ring case":
`anySolution()` and `uniqueSolution()` must
both recover the wrap completion, and a 4×4 blank board must still solve through the tree branch.

The border rule is a different story: the maximum number of colour transitions around the
perimeter over every valid colouring is 2, so `addBorderConstraint`'s `≤ 2` is sound.

## Building solutions instead of searching for them

Because a solution *is* a Hamiltonian path/cycle, the generator need not search at all.
`scratch/hamiltonian-sampler.mjs` samples one directly: pick a Hamiltonian path whose two ends lie
on the border of the interior grid (or a cycle), take its edges as the interface cracks, and
2-colour the cells across them.

```
grid      open path: built / valid     cycle: built / valid     inconsistent
4x4        200 / 200                       0 / 0                         0
5x5        200 / 200                       200 / 200                     0
6x6        200 / 200                       0 / 0                         0
8x8        184 / 184                       0 / 0                         0
10x10      135 / 135                       0 / 0                         0
```

Every sampled interface produced a valid Yin-Yang — 100% at every size, and zero inconsistent
colourings — which is a strong check on the characterisation. The cycle row failing on even sizes
is the same parity statement as above, arrived at from the other direction.

The yield drops off, though, and not because the construction is wrong: those "built" counts are
lower bounds on how often a *usable* interface comes out of one randomised DFS. An open interface
needs both ends of the path on the border of the interior grid, and a Warnsdorff-ordered path's far
end is rarely there — `scratch/sample-timing.mjs` measures the no-interface rate climbing from 0/20
at 6x6 to 20/20 at 18x18 and above, while one path build stays cheap (4-20 ms, roughly linear). So
"sample, then filter on the endpoints" is the wrong shape at size; the fix is to pin the endpoints,
or to shuffle an existing Hamiltonian path with rotation moves.

The current `randomSolution` is a rejection sampler: draw a random seed, ask the solver for a board,
repeat until the board is valid. Direct construction replaces that with a single build, makes validity
structural rather than something to be tested, and allows the *shape* of the puzzle to be chosen
rather than hoped for — a meandering interface for a harder puzzle, a simple one for an easier one.

## Open problems that land on this codebase

- **Clue density.** The reduction fills almost the whole board. Real puzzles — and everything
  this app generates — are sparse. The authors conjecture hardness survives with O(n) clues,
  suspect o(n) would require fundamentally different techniques, and guess the problem is FPT in
  the number of clues.
- **Another Solution Problem / counting.** Their reduction is parsimonious, so ASP- or
  #P-hardness of TRVB would carry over — but that is open. "Another Solution" is exactly what the
  Share button asks when it is gated on a *unique* solution, so the generator is working in a
  regime nobody has pinned down.

## Also worth reading

- Robert A. Hearn and Erik D. Demaine, *Games, Puzzles, and Computation* (2009) — the standard
  reference for the complexity of this whole genre.
- Erik D. Demaine and Mikhail Rudoy, *Tree-Residue Vertex-Breaking: a new tool for proving
  hardness*, SWAT 2018 — where TRVB comes from.
- Their §1.2 survey alone lists roughly forty puzzles proved NP-complete, from Heyawake,
  Nurikabe and Slitherlink to Yajilin and Tatamibari.
import Logic from "logic-solver";
import type { Extension, GridPossibility, Location, YinYangPuzzlePartialDefinition, YinYangPuzzleSolution } from "./types";

// `extensions()` (used by the design tool to show implications) needs exact
// answers, so it gives the connectivity refutation a much larger budget than
// the generator's quick `anySolution`/`uniqueSolution` (which keep the default).
const EXTENSIONS_MAX_ITERATIONS = 5000;

class YYSolver {
    private puzzle: YinYangPuzzlePartialDefinition
    private solver: Logic.Solver

    constructor(puzzle: YinYangPuzzlePartialDefinition) {
        this.puzzle = puzzle;
        this.solver = new Logic.Solver();
        this.addFixedCells();
        this.addBasicConstraints();
        this.addCuttingConstraints();
        this.addBorderConstraint();
        this.addConnectivityConstraints();
    }

    private getCellVar(row: number, col: number): string {
        // The meaning of each variable is "this cell is white."
        return `cell_${row}_${col}`;
    }

    private getVarLoc(variableName: string): Location | null {
        const match = variableName.match(/^cell_(\d+)_(\d+)$/);
        if (match) {
            const [, row, col] = match.map(Number);
            return { row: row, col: col };
        }
        return null;
    }

    private forbidBlock(block: boolean[]) {
        // Implementation for forbidding a specific 2x2 block
        for (let row = 0; row < this.puzzle.size.height - 1; row++) {
            for (let col = 0; col < this.puzzle.size.width - 1; col++) {
                // Add constraints for each 2x2 block to ensure it contains both black and white cells
                const blockVars = [
                    this.getCellVar(row, col),
                    this.getCellVar(row, col + 1),
                    this.getCellVar(row + 1, col),
                    this.getCellVar(row + 1, col + 1)
                ];
                const blockConstraint = Logic.and(...blockVars.map((v, index) => block[index] ? v : Logic.not(v)));
                this.solver.forbid(blockConstraint);
            }
        }
    }

    private addFixedCells() {
        // Implementation for adding fixed cells to the solver
        for (let row = 0; row < this.puzzle.size.height; row++) {
            for (let col = 0; col < this.puzzle.size.width; col++) {
                if (this.puzzle.fixedWhites[row][col]) {
                    this.solver.require(this.getCellVar(row, col));
                } else if (this.puzzle.fixedBlacks[row][col]) {
                    this.solver.forbid(this.getCellVar(row, col));
                }
            }
        }
    }

    private addBasicConstraints() {
        // Implementation for adding basic constraints to the solver
        this.forbidBlock([true, true, true, true]); // Forbid all white block
        this.forbidBlock([false, false, false, false]); // Forbid all black block
    }

    /**
     * Enforces that each colour forms a single connected group ("treelike").
     *
     * A valid yin-yang colouring is connected and acyclic (no holes), so each
     * colour's adjacency graph is a tree: a tree on n cells has exactly n-1
     * same-colour adjacencies. Requiring `n - sameColourEdges = 1` per colour
     * forces a single connected, acyclic component — i.e. connectivity.
     */
    private addConnectivityConstraints() {
        const { height, width } = this.puzzle.size;

        const whiteVars: Logic.Term[] = [];
        const whiteEdges: Logic.Term[] = [];
        const blackEdges: Logic.Term[] = [];

        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                whiteVars.push(this.getCellVar(r, c));
            }
        }

        // Horizontal adjacencies.
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width - 1; c++) {
                const a = this.getCellVar(r, c);
                const b = this.getCellVar(r, c + 1);
                whiteEdges.push(Logic.and(a, b));
                blackEdges.push(Logic.and(Logic.not(a), Logic.not(b)));
            }
        }
        // Vertical adjacencies.
        for (let r = 0; r < height - 1; r++) {
            for (let c = 0; c < width; c++) {
                const a = this.getCellVar(r, c);
                const b = this.getCellVar(r + 1, c);
                whiteEdges.push(Logic.and(a, b));
                blackEdges.push(Logic.and(Logic.not(a), Logic.not(b)));
            }
        }

        const nWhite = Logic.sum(...whiteVars);
        const nBlack = Logic.sum(...whiteVars.map((v) => Logic.not(v)));
        const eWhite = Logic.sum(...whiteEdges);
        const eBlack = Logic.sum(...blackEdges);

        // White is a tree: nWhite - eWhite = 1  =>  nWhite = eWhite + 1.
        this.solver.require(Logic.equalBits(nWhite, Logic.sum(eWhite, Logic.constantBits(1))));
        // Black is a tree: nBlack - eBlack = 1.
        this.solver.require(Logic.equalBits(nBlack, Logic.sum(eBlack, Logic.constantBits(1))));
    }

    private addCuttingConstraints() {
        this.forbidBlock([true, false, false, true]); // Forbid checkerboard pattern
        this.forbidBlock([false, true, true, false]); // Forbid checkerboard pattern
    }

    /**
     * Inferred rule: the outer border, considered alone, is a single contiguous
     * black group and a single contiguous white group. Walking the perimeter as a
     * closed loop, this means there are at most 2 colour transitions (0 if one
     * colour covers the whole border, exactly 2 if both colours touch it).
     */
    private addBorderConstraint() {
        const { height, width } = this.puzzle.size;

        // Perimeter cells in clockwise order (visits each border cell once).
        const perimeter: Location[] = [];
        for (let c = 0; c < width; c++) perimeter.push({ row: 0, col: c });
        for (let r = 1; r < height; r++) perimeter.push({ row: r, col: width - 1 });
        for (let c = width - 2; c >= 0; c--) perimeter.push({ row: height - 1, col: c });
        for (let r = height - 2; r >= 1; r--) perimeter.push({ row: r, col: 0 });

        const count = perimeter.length;
        const transitions: Logic.Term[] = [];
        for (let i = 0; i < count; i++) {
            const a = this.getCellVar(perimeter[i].row, perimeter[i].col);
            const b = this.getCellVar(perimeter[(i + 1) % count].row, perimeter[(i + 1) % count].col);
            transitions.push(Logic.xor(a, b));
        }

        const atMostTwoTransitions = Logic.lessThanOrEqual(
            Logic.sum(...transitions),
            Logic.constantBits(2)
        );
        this.solver.require(atMostTwoTransitions);
    }

    public logicSolutionToYinYangSolution(solution: Logic.Solution): YinYangPuzzleSolution {
        let isWhite: boolean[][] = Array.from({ length: this.puzzle.size.height }, () => Array(this.puzzle.size.width).fill(false));
        solution.getTrueVars().forEach((varName) => {
            const loc = this.getVarLoc(varName);
            if (loc) {
                isWhite[loc.row][loc.col] = true;
            }
        });
        return { size: this.puzzle.size, isWhite };
    }

    public anySolution(): YinYangPuzzleSolution | null {
        const solution = this.solveConnected();
        if (!solution) {
            return null;
        }
        return this.logicSolutionToYinYangSolution(solution);
    }

    public uniqueSolution(): YinYangPuzzleSolution | null {
        const solution = this.solveConnected();
        if (!solution) {
            return null;
        }
        const { height, width } = this.puzzle.size;
        const whites = new Set(solution.getTrueVars());
        // A second, distinct solution exists iff some non-fixed cell can take the
        // opposite colour. Scan for the first such cell and use a single-cell
        // assumption, which `solveConnected` handles reliably. (Forbidding the
        // whole assignment instead is fragile: the connectivity refutation can get
        // stuck cycling through disconnected models and wrongly deem a non-unique
        // puzzle unique.)
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                if (this.puzzle.fixedWhites[r][c] || this.puzzle.fixedBlacks[r][c]) continue;
                const name = this.getCellVar(r, c);
                const opposite = whites.has(name) ? Logic.not(name) : name;
                const second = this.solveConnected(opposite);
                if (second) {
                    return null; // Multiple solutions exist
                }
            }
        }
        return this.logicSolutionToYinYangSolution(solution);
    }

    /**
     * True if every white cell and every black cell forms a single 4-connected group.
     */
    private isConnectedSolution(solution: Logic.Solution): boolean {
        const { height, width } = this.puzzle.size;
        const cellWhites = new Set(solution.getTrueVars());
        const visited = new Set<string>();
        const flood = (white: boolean, sr: number, sc: number) => {
            const stack = [[sr, sc]];
            while (stack.length) {
                const [r, c] = stack.pop()!;
                const key = `${r},${c}`;
                if (visited.has(key)) continue;
                visited.add(key);
                for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nr = r + dr, nc = c + dc;
                    if (nr < 0 || nc < 0 || nr >= height || nc >= width) continue;
                    if (cellWhites.has(this.getCellVar(nr, nc)) === white) stack.push([nr, nc]);
                }
            }
        };

        const whites: [number, number][] = [];
        const blacks: [number, number][] = [];
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                if (cellWhites.has(this.getCellVar(r, c))) whites.push([r, c]);
                else blacks.push([r, c]);
            }
        }

        if (whites.length) {
            flood(true, whites[0][0], whites[0][1]);
            if (!whites.every(([r, c]) => visited.has(`${r},${c}`))) return false;
            visited.clear();
        }
        if (blacks.length) {
            flood(false, blacks[0][0], blacks[0][1]);
            if (!blacks.every(([r, c]) => visited.has(`${r},${c}`))) return false;
        }
        return true;
    }

    /** The exact assignment as a conjunction of cell literals. */
    private assignmentTerm(solution: Logic.Solution): Logic.Term {
        const whites = new Set(solution.getTrueVars());
        const literals: Logic.Term[] = [];
        for (let row = 0; row < this.puzzle.size.height; row++) {
            for (let col = 0; col < this.puzzle.size.width; col++) {
                const name = this.getCellVar(row, col);
                literals.push(whites.has(name) ? name : Logic.not(name));
            }
        }
        return Logic.and(...literals);
    }

    /**
     * Solve (optionally under an assumption), rejecting any solution whose colours
     * are not each a single connected group by forbidding that model and re-solving.
     * This makes connectivity exact (the edge-count "tree" constraint alone is not
     * sufficient — it can be satisfied by a cyclic component + a detached cell).
     *
     * The refutation can need many iterations before it reaches a connected model,
     * so callers that need exact answers can pass a larger `maxIterations`.
     */
    private solveConnected(assumption?: Logic.Term, maxIterations = 500): Logic.Solution | null {
        for (let i = 0; i < maxIterations; i++) {
            const solution = assumption ? this.solver.solveAssuming(assumption) : this.solver.solve();
            if (!solution) return null;
            if (this.isConnectedSolution(solution)) return solution;
            this.solver.forbid(this.assignmentTerm(solution));
        }
        return null;
    }

    public extensions(): Extension {
        const { height, width } = this.puzzle.size;
        const possibilities: GridPossibility[][] = Array.from({ length: height }, () =>
            Array.from({ length: width }, () => ({ fixed: false, blackPossible: false, whitePossible: false }))
        );

        // Fixed (given) cells.
        this.puzzle.fixedWhites.forEach((row, r) => {
            row.forEach((isWhite, c) => {
                if (isWhite) possibilities[r][c] = { fixed: true, blackPossible: false, whitePossible: true };
            });
        });
        this.puzzle.fixedBlacks.forEach((row, r) => {
            row.forEach((isBlack, c) => {
                if (isBlack) possibilities[r][c] = { fixed: true, blackPossible: true, whitePossible: false };
            });
        });

        // Record both colour possibilities from a full assignment.
        const apply = (solution: Logic.Solution) => {
            const whites = new Set(solution.getTrueVars());
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    const poss = possibilities[r][c];
                    if (poss.fixed) continue;
                    if (whites.has(this.getCellVar(r, c))) poss.whitePossible = true;
                    else poss.blackPossible = true;
                }
            }
        };

        // Seed from any one connected solution: every cell then already knows one
        // colour it can take, so we only ever need to test the *other* colour.
        const seed = this.solveConnected(undefined, EXTENSIONS_MAX_ITERATIONS);
        if (seed) apply(seed);

        // For each cell, resolve only the possibility we haven't established yet.
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                const poss = possibilities[r][c];
                if (poss.fixed || (poss.whitePossible && poss.blackPossible)) continue;

                if (poss.whitePossible) {
                    // Only white known; test whether black is possible.
                    const solution = this.solveConnected(Logic.not(this.getCellVar(r, c)), EXTENSIONS_MAX_ITERATIONS);
                    if (solution) apply(solution);
                } else if (poss.blackPossible) {
                    // Only black known; test whether white is possible.
                    const solution = this.solveConnected(this.getCellVar(r, c), EXTENSIONS_MAX_ITERATIONS);
                    if (solution) apply(solution);
                }
            }
        }

        return { size: this.puzzle.size, possibilities };
    }
}

export default YYSolver;
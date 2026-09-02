import Logic from "logic-solver";
import type { Extension, Location, YinYangPuzzlePartialDefinition, YinYangPuzzleSolution } from "./types";

const USE_ONLY_BASIC_RULES = false;

class YYSolver {
    private puzzle: YinYangPuzzlePartialDefinition
    private solver: Logic.Solver

    constructor(puzzle: YinYangPuzzlePartialDefinition) {
        this.puzzle = puzzle;
        this.solver = new Logic.Solver();
        this.addBasicConstraints();
        this.addConnectivityConstraints();
        if (!USE_ONLY_BASIC_RULES) {
            this.addCuttingConstraints();
            this.addBorderConstraint();
        }
        this.addFixedCells();
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
        const solution = this.solver.solve();
        if (!solution) {
            return null;
        }
        return this.logicSolutionToYinYangSolution(solution);
    }

    public uniqueSolution(): YinYangPuzzleSolution | null {
        const solution = this.solver.solve();
        if (!solution) {
            return null;
        }
        const secondSolution = this.solver.solveAssuming(this.differentAssignment(solution));
        if (secondSolution) {
            return null; // Multiple solutions exist
        }
        return this.logicSolutionToYinYangSolution(solution);
    }

    /**
     * A term that forces the full assignment to differ from `solution`, used to
     * test whether a second, distinct solution exists. It negates the whole
     * assignment (whites forced black, blacks forced white) rather than just the
     * list of true vars. `getTrueVars()` only lists the white cells, so the black
     * cells are derived from every cell variable.
     */
    private differentAssignment(solution: Logic.Solution): Logic.Term {
        const whites = new Set(solution.getTrueVars());
        const literals: Logic.Term[] = [];
        for (let row = 0; row < this.puzzle.size.height; row++) {
            for (let col = 0; col < this.puzzle.size.width; col++) {
                const name = this.getCellVar(row, col);
                literals.push(whites.has(name) ? name : Logic.not(name));
            }
        }
        return Logic.not(Logic.and(...literals));
    }

    public extensions(): Extension {
        let extensions: Extension = {
            size: this.puzzle.size,
            possibilities: Array.from({ length: this.puzzle.size.height }, () => Array(this.puzzle.size.width).fill({ fixed: false, blackPossible: false, whitePossible: false }))
        };
        const possibilities = extensions.possibilities;

        // Set the fixed components in the possibilities grid based on the puzzle's fixed whites and blacks
        this.puzzle.fixedWhites.forEach((row, r) => {
            row.forEach((isWhite, c) => {
                if (isWhite) {
                    possibilities[r][c] = { fixed: true, blackPossible: false, whitePossible: true };
                }
            });
        });
        this.puzzle.fixedBlacks.forEach((row, r) => {
            row.forEach((isBlack, c) => {
                if (isBlack) {
                    possibilities[r][c] = { fixed: true, blackPossible: true, whitePossible: false };
                }
            });
        });

        // Test each non-fixed square for whether it may potentially be white or black
        for (let row = 0; row < this.puzzle.size.height; row++) {
            for (let col = 0; col < this.puzzle.size.width; col++) {
                // Solver currently only has the requirements put up in the puzzle definition given to us, so 
                // we add more constraints and see if they work.
                const currentPoss = possibilities[row][col];
                if (currentPoss.fixed || (currentPoss.whitePossible && currentPoss.blackPossible)) continue;

                const whiteSolution = this.solver.solveAssuming(this.getCellVar(row, col));
                const blackSolution = this.solver.solveAssuming(Logic.not(this.getCellVar(row, col)));
                const canBeWhite = whiteSolution !== null;
                const canBeBlack = blackSolution !== null;
                currentPoss.whitePossible = canBeWhite;
                currentPoss.blackPossible = canBeBlack;
                whiteSolution?.getTrueVars().forEach((varName) => {
                    const loc = this.getVarLoc(varName);
                    if (loc) {
                        possibilities[loc.row][loc.col].whitePossible = true;
                    }
                });
                blackSolution?.getTrueVars().forEach((varName) => {
                    const loc = this.getVarLoc(varName);
                    if (loc) {
                        possibilities[loc.row][loc.col].blackPossible = true;
                    }
                });
            }
        }
        return extensions;
    }
}

export default YYSolver;
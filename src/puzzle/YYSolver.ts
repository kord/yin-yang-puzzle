import Logic from "logic-solver";
import type { Extension, Location, YinYangPuzzlePartialDefinition, YinYangPuzzleSolution } from "./types";

const USE_ONLY_BASIC_RULES = true;

class YYSolver {
    private puzzle: YinYangPuzzlePartialDefinition
    private solver: Logic.Solver

    constructor(puzzle: YinYangPuzzlePartialDefinition) {
        this.puzzle = puzzle;
        this.solver = new Logic.Solver();
        this.addBasicConstraints();
        if (!USE_ONLY_BASIC_RULES) {
            this.addCuttingConstraints();
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

    private addBasicConstraints() {
        // Implementation for adding basic constraints to the solver
        this.forbidBlock([true, true, true, true]); // Forbid all white block
        this.forbidBlock([false, false, false, false]); // Forbid all black block
    }

    private addCuttingConstraints() {
        this.forbidBlock([true, false, true, false]); // Forbid checkerboard pattern
        this.forbidBlock([false, true, false, true]); // Forbid checkerboard pattern
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
        const secondSolution = this.solver.solveAssuming(Logic.not(solution.getTrueVars()));
        if (secondSolution) {
            return null; // Multiple solutions exist
        }
        return this.logicSolutionToYinYangSolution(solution);
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
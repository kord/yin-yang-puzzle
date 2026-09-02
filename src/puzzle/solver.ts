
import type { YinYangPuzzleDefinition, YinYangPuzzlePartialDefinition } from './types';
import YYSolver from './YYSolver';




function validateUniquePuzzle(puzzle: YinYangPuzzlePartialDefinition): YinYangPuzzleDefinition | null {
    const s = new YYSolver(puzzle);
    const soln = s.uniqueSolution();
    if (soln) {
        return {
            ...puzzle,
            solution: soln,
        };
    }

    return null;
}

export { validateUniquePuzzle };
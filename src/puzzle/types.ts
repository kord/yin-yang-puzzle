type GridPossibility = {
    fixed: boolean;
    blackPossible: boolean;
    whitePossible: boolean;
};

type Extension = {
    size: Size;
    possibilities: GridPossibility[][];
};

type Size = {
    width: number;
    height: number;
};

type Location = {
    row: number;
    col: number;
};

type YinYangPuzzleSolution = {
    size: Size;
    isWhite: boolean[][];
}

interface YinYangPuzzlePartialDefinition {
    size: Size;
    fixedWhites: readonly boolean[][];
    fixedBlacks: readonly boolean[][];
};

type YinYangPuzzleDefinition = {
    size: Size;
    fixedWhites: readonly boolean[][];
    fixedBlacks: readonly boolean[][];
    solution: YinYangPuzzleSolution;
};

type UserCell = '.' | 'b' | 'w'

/** A puzzle loaded from a share link (`?p=`). */
type SharedPuzzle = {
    encoded: string
    givens: YinYangPuzzlePartialDefinition
};

export type {
    GridPossibility,
    Size,
    Location,
    YinYangPuzzlePartialDefinition,
    YinYangPuzzleSolution,
    YinYangPuzzleDefinition,
    Extension,
    UserCell,
    SharedPuzzle,
};
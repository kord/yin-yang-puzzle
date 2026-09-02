type GridPossibility = {
    fixed: boolean;
    blackPossible: boolean;
    whitePossible: boolean;
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
    fixedWhites: boolean[][];
    fixedBlacks: boolean[][];
    solution: YinYangPuzzleSolution;
};

export type {
    GridPossibility,
    Size,
    Location,
    YinYangPuzzlePartialDefinition,
    YinYangPuzzleSolution,
    YinYangPuzzleDefinition
};
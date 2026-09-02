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

export type {
    GridPossibility,
    Size,
    Location,
    YinYangPuzzlePartialDefinition,
    YinYangPuzzleSolution,
    YinYangPuzzleDefinition,
    Extension,
};
import type { Extension, Size, YinYangPuzzleDefinition, YinYangPuzzlePartialDefinition } from './types'

// Messages exchanged with the puzzle-generation worker (generator.worker.ts).
export type GenRequest = { id: number; size: Size; seed: number; date?: string; prefetch?: boolean }
export type GenResponse = { id: number; puzzle: YinYangPuzzleDefinition; date?: string; prefetch?: boolean }

// Messages exchanged with the solver worker (solver.worker.ts).
export type SolveRequest = { id: number; puzzle: YinYangPuzzlePartialDefinition }
export type SolveResponse = { id: number; extensions: Extension }

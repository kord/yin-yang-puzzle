import { generateRandomPuzzle } from './generator'
import type { Size, YinYangPuzzleDefinition } from './types'

type GenRequest = { id: number; size: Size; seed: number; date?: string; prefetch?: boolean }
type GenResponse = { id: number; puzzle: YinYangPuzzleDefinition; date?: string; prefetch?: boolean }

const ctx = self as unknown as {
    onmessage: ((e: MessageEvent) => void) | null
    postMessage: (data: GenResponse) => void
}

ctx.onmessage = (e: MessageEvent<GenRequest>) => {
    const { id, size, seed, date, prefetch } = e.data
    const puzzle = generateRandomPuzzle(size, seed)
    ctx.postMessage({ id, puzzle, date, prefetch })
}

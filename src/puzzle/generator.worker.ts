import { generateRandomPuzzle } from './generator'
import type { GenRequest, GenResponse } from './messages'

const ctx = self as unknown as {
    onmessage: ((e: MessageEvent) => void) | null
    postMessage: (data: GenResponse) => void
}

ctx.onmessage = (e: MessageEvent<GenRequest>) => {
    const { id, size, seed, date, prefetch } = e.data
    const puzzle = generateRandomPuzzle(size, seed)
    ctx.postMessage({ id, puzzle, date, prefetch })
}

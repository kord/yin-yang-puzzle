import YYSolver from './YYSolver'
import type { SolveRequest, SolveResponse } from './messages'

const ctx = self as unknown as {
    onmessage: ((e: MessageEvent) => void) | null
    postMessage: (data: SolveResponse) => void
}

ctx.onmessage = (e: MessageEvent<SolveRequest>) => {
    const { id, puzzle } = e.data
    const extensions = new YYSolver(puzzle).extensions()
    ctx.postMessage({ id, extensions })
}

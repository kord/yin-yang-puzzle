import YYSolver from './YYSolver'
import type { Extension, YinYangPuzzlePartialDefinition } from './types'

type SolveRequest = { id: number; puzzle: YinYangPuzzlePartialDefinition }
type SolveResponse = { id: number; extensions: Extension }

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null
  postMessage: (data: SolveResponse) => void
}

ctx.onmessage = (e: MessageEvent<SolveRequest>) => {
  const { id, puzzle } = e.data
  const extensions = new YYSolver(puzzle).extensions()
  ctx.postMessage({ id, extensions })
}

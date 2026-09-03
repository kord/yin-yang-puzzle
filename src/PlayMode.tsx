import { useEffect, useRef, useState } from 'react'
import { PuzzleGrid, type ElementRef } from './PuzzleGrid'
import type { YinYangPuzzleDefinition, Size } from './puzzle/types'
import { dailySeed } from './puzzle/seed'
import Confetti from './Confetti'
import './App.css'

const SIZES = Array.from({ length: 9 }, (_, i) => i + 4) // 4x4 .. 12x12

type GenResponse = { id: number; puzzle: YinYangPuzzleDefinition }

function PlayMode() {
  const [size, setSize] = useState(6)
  const [generating, setGenerating] = useState(false)
  const [puzzle, setPuzzle] = useState<YinYangPuzzleDefinition | null>(null)
  const [solved, setSolved] = useState(false)
  const [status, setStatus] = useState('')
  const [daily, setDaily] = useState(true)
  const [seed, setSeed] = useState<number | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<PuzzleGrid | null>(null)
  const sizeRef = useRef(size)
  const puzzleRef = useRef<YinYangPuzzleDefinition | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const updatingRef = useRef(false)
  const dailyRef = useRef(true)

  useEffect(() => {
    sizeRef.current = size
  }, [size])

  useEffect(() => {
    puzzleRef.current = puzzle
  }, [puzzle])

  // Build the puzzle-generation worker once.
  useEffect(() => {
    const worker = new Worker(new URL('./puzzle/generator.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker
    worker.onmessage = (e: MessageEvent<GenResponse>) => {
      if (e.data.id !== requestIdRef.current) return // ignore stale results
      setGenerating(false)
      setPuzzle(e.data.puzzle)
      setSolved(false)
      setStatus('')
    }
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  // (Re)create the grid and lay down the given clues.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const grid = new PuzzleGrid({
      rows: size,
      cols: size,
      kinds: { square: true, edge: false, vertex: false },
      paintButtons: { square: { 0: 'activated', 2: 'inactivated' } },
      onStateChange: () => {
        if (!updatingRef.current) checkCompletion()
      },
    })
    gridRef.current = grid
    grid.mount(container)

    const pz = puzzleRef.current
    if (pz && pz.size.width === size) {
      updatingRef.current = true
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const ref: ElementRef = { kind: 'square', row: r, col: c }
          if (pz.fixedWhites[r][c]) {
            grid.setState(ref, 'inactivated')
            grid.setReadonly(ref, true)
          } else if (pz.fixedBlacks[r][c]) {
            grid.setState(ref, 'activated')
            grid.setReadonly(ref, true)
          }
        }
      }
      updatingRef.current = false
    }

    return () => {
      grid.destroy()
      gridRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, puzzle])

  // Generate a fresh puzzle on mount and whenever the size changes.
  useEffect(() => {
    generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  function generate(isDaily = dailyRef.current) {
    dailyRef.current = isDaily
    setDaily(isDaily)
    const id = ++requestIdRef.current
    setGenerating(true)
    setSolved(false)
    setStatus(isDaily ? 'Daily puzzle…' : 'Generating…')
    const s: Size = { width: sizeRef.current, height: sizeRef.current }
    const seedValue = isDaily ? dailySeed() : Math.floor(Math.random() * 0xffffffff)
    setSeed(seedValue)
    workerRef.current?.postMessage({ id, size: s, seed: seedValue })
  }

  function checkCompletion() {
    const grid = gridRef.current
    const pz = puzzleRef.current
    if (!grid || !pz) return
    const n = sizeRef.current

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const ref: ElementRef = { kind: 'square', row: r, col: c }
        const state = grid.getState(ref)
        if (state === 'untouched') return // board not yet full
        const isWhite = state === 'inactivated'
        if (isWhite !== pz.solution.isWhite[r][c]) return // a mismatch
      }
    }

    // Every cell matches the unique solution.
    setSolved(true)
    setStatus('Solved!')
    updatingRef.current = true
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        grid.setReadonly({ kind: 'square', row: r, col: c }, true)
      }
    }
    updatingRef.current = false
  }

  return (
    <div className="app__layout">
      <div ref={containerRef} className="app__grid" />

      <aside className="app__panel">
        <h2 className="app__heading">Play</h2>

        <div className="app__controls">
          <button type="button" className="app__undo" onClick={() => generate(false)} disabled={generating}>
            New Puzzle
          </button>
          <button type="button" className="app__undo" onClick={() => generate(true)} disabled={generating}>
            Daily Puzzle
          </button>
          <label className="app__sizelabel">
            Size
            <select
              className="app__size"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}×{s}
                </option>
              ))}
            </select>
          </label>
        </div>

        {puzzle && seed !== null && (
          <p className="app__text">
            {daily ? 'Today’s seed' : 'Seed'}: <code className="app__code">{seed}</code>
          </p>
        )}

        <p className="app__text">
          <strong>Left-click</strong> a
          <br />
          <code className="app__code">black</code> stone.
        </p>
        <p className="app__text">
          <strong>Right-click</strong> a
          <br />
          <code className="app__code">white</code> stone.
        </p>
        <p className="app__text">
          Fill every cell so the stones form a valid
          <br />
          Yin-Yang pattern.
        </p>

        <h2 className="app__heading">Status</h2>
        <p className="app__status">
          {generating ? status || 'Generating…' : status || (puzzle ? '—' : '')}
        </p>
      </aside>

      <Confetti active={solved} />
    </div>
  )
}

export default PlayMode

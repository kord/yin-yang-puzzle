import { useEffect, useRef } from 'react'
import { PuzzleGrid } from './PuzzleGrid'
import './App.css'

function App() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const statusRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const grid = new PuzzleGrid({
      rows: 6,
      cols: 6,
      kinds: { square: true, edge: false, vertex: false },
      paintCycle: { square: ['activated', 'inactivated'] },
      onStateChange: (ref, state) => {
        if (statusRef.current) {
          statusRef.current.textContent = `(${ref.row},${ref.col}) → ${state}`
        }
      },
    })

    // Parse the 6x6 puzzle definition.
    //   'w' = fixed white, 'b' = fixed black, 'x' = a cell the user fills in.
    const PUZZLE = 'xxxxxb/xxwxxw/xxxxwx/xxwxxx/xwxbxx/xxxxxx'
    PUZZLE.split('/').forEach((rowStr, row) => {
      rowStr.split('').forEach((ch, col) => {
        if (ch === 'w') {
          grid.setState({ kind: 'square', row, col }, 'inactivated')
          grid.setReadonly({ kind: 'square', row, col })
        } else if (ch === 'b') {
          grid.setState({ kind: 'square', row, col }, 'activated')
          grid.setReadonly({ kind: 'square', row, col })
        }
      })
    })

    grid.mount(container)

    return () => grid.destroy()
  }, [])

  return (
    <div className="app">
      <h1>Yin Yang Puzzle</h1>

      <div className="app__layout">
        <div ref={containerRef} className="app__grid" />

        <aside className="app__panel">
          <h2 className="app__heading">Controls</h2>
          <p className="app__text">
            <strong>Left-drag</strong> to fill cells, cycling
            <br />
            <code className="app__code">black → white</code>.
          </p>
          <p className="app__text">
            <strong>Right-drag</strong> (or <kbd className="app__key">Ctrl</kbd>/<kbd className="app__key">Shift</kbd>+click)
            clears back to <code className="app__code">empty</code>.
          </p>

          <h2 className="app__heading">Legend</h2>
          <ul className="app__legend">
            <li className="app__legend-item"><span className="app__swatch app__swatch--untouched" /> empty</li>
            <li className="app__legend-item"><span className="app__swatch app__swatch--activated" /> black</li>
            <li className="app__legend-item"><span className="app__swatch app__swatch--inactivated" /> white</li>
            <li className="app__legend-item"><span className="app__swatch app__swatch--given" /> given (locked)</li>
          </ul>

          <h2 className="app__heading">Last change</h2>
          <p className="app__status"><span ref={statusRef}>—</span></p>
        </aside>
      </div>
    </div>
  )
}

export default App

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
      rows: 5,
      cols: 5,
      innerGap: 10,
      onStateChange: (ref, state) => {
        if (statusRef.current) {
          const label = ref.orientation ? `${ref.kind} (${ref.orientation})` : ref.kind
          statusRef.current.textContent = `${label} @ (${ref.row},${ref.col}) → ${state}`
        }
      },
    })

    // A few elements are defined by the puzzle, so they are immutable.
    grid.setState({ kind: 'square', row: 2, col: 2 }, 'fixed')
    grid.setState({ kind: 'edge', row: 2, col: 2, orientation: 'horizontal' }, 'fixed')
    grid.setState({ kind: 'vertex', row: 2, col: 2 }, 'fixed')

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
            <strong>Left-drag</strong> to paint. Elements cycle through
            <br />
            <code className="app__code">activated → inactivated → x → untouched</code>.
          </p>
          <p className="app__text">
            <strong>Right-drag</strong> (or <kbd className="app__key">Ctrl</kbd>/<kbd className="app__key">Shift</kbd>+click)
            erases back to <code className="app__code">untouched</code>.
          </p>

          <h2 className="app__heading">Legend</h2>
          <ul className="app__legend">
            <li className="app__legend-item"><span className="app__swatch app__swatch--untouched" /> untouched</li>
            <li className="app__legend-item"><span className="app__swatch app__swatch--activated" /> activated</li>
            <li className="app__legend-item"><span className="app__swatch app__swatch--inactivated" /> inactivated</li>
            <li className="app__legend-item"><span className="app__swatch app__swatch--x" /> x</li>
            <li className="app__legend-item"><span className="app__swatch app__swatch--fixed" /> fixed (immutable)</li>
          </ul>

          <h2 className="app__heading">Last change</h2>
          <p className="app__status"><span ref={statusRef}>—</span></p>
        </aside>
      </div>
    </div>
  )
}

export default App

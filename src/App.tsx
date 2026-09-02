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

      <div className="puzzle-layout">
        <div ref={containerRef} className="puzzle-mount" />

        <aside className="puzzle-panel">
          <h2>Controls</h2>
          <p>
            <strong>Left-drag</strong> to paint. Elements cycle through
            <br />
            <code>activated → inactivated → x → untouched</code>.
          </p>
          <p>
            <strong>Right-drag</strong> (or <kbd>Ctrl</kbd>/<kbd>Shift</kbd>+click)
            erases back to <code>untouched</code>.
          </p>

          <h2>Legend</h2>
          <ul className="legend">
            <li><span className="sw sw-untouched" /> untouched</li>
            <li><span className="sw sw-activated" /> activated</li>
            <li><span className="sw sw-inactivated" /> inactivated</li>
            <li><span className="sw sw-x" /> x</li>
            <li><span className="sw sw-fixed" /> fixed (immutable)</li>
          </ul>

          <h2>Last change</h2>
          <p className="status"><span ref={statusRef}>—</span></p>
        </aside>
      </div>
    </div>
  )
}

export default App

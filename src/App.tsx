import { useMemo } from 'react'
import DesignMode from './DesignMode'
import PlayMode from './PlayMode'
import { decodePuzzle } from './puzzle/encode'
import type { SharedPuzzle } from './puzzle/types'
import './App.css'

/** Read a shared puzzle from the `?p=` query param, if any. */
function parseShared(): SharedPuzzle | null {
  const p = new URLSearchParams(window.location.search).get('p')
  if (!p) return null
  const givens = decodePuzzle(p)
  if (!givens) return null
  return { encoded: p, givens }
}

/** True when the app was opened in design mode (`?mode=design`). */
function parseDesign(): boolean {
  return new URLSearchParams(window.location.search).get('mode') === 'design'
}

function App() {
  const shared = useMemo(parseShared, [])
  const design = useMemo(parseDesign, [])

  const reloadHome = () => {
    // Full page reload back to the bare path, clearing any query state.
    window.location.replace(window.location.pathname)
  }

  return (
    <div className="app">
      <h1 className="app__title" onClick={reloadHome} title="Reload page">
        <span className="app__title-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="60" height="60">
            <circle cx="24" cy="24" r="22" fill="#f0ede4" />
            <path d="M24 2 a22 22 0 0 0 0 44 a11 11 0 0 1 0 -22 a11 11 0 0 0 0 -22 z" fill="#1a1a1a" />
            <circle cx="24" cy="13" r="3.4" fill="#f0ede4" />
            <circle cx="24" cy="35" r="3.4" fill="#1a1a1a" />
          </svg>
        </span>
        Yin Yang Puzzle
      </h1>

      {design ? <DesignMode /> : <PlayMode shared={shared} />}
    </div>
  )
}

export default App

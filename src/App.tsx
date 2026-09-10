import { useMemo } from 'react'
import DesignMode from './DesignMode'
import PlayMode from './play/PlayMode'
import ThemeToggle from './ThemeToggle'
import { decodePuzzle } from './puzzle/encode'
import type { SharedPuzzle } from './puzzle/types'
import './App.css'

/** Read the URL query once: a shared puzzle (`?p=`) and whether design mode was requested (`?mode=design`). */
function parseUrl(): { shared: SharedPuzzle | null; design: boolean } {
  const params = new URLSearchParams(window.location.search)
  const p = params.get('p')
  const givens = p ? decodePuzzle(p) : null
  return {
    shared: p && givens ? { encoded: p, givens } : null,
    design: params.get('mode') === 'design',
  }
}

function App() {
  const { shared, design } = useMemo(parseUrl, [])

  const reloadHome = () => {
    // Full page reload back to the bare path, clearing any query state.
    window.location.replace(window.location.pathname)
  }

  return (
    <div className="app">
      <ThemeToggle />
      <h1 className="app__title-heading">
        <button type="button" className="app__title" onClick={reloadHome} title="Reload page">
          <span className="app__title-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="60" height="60">
              <circle cx="24" cy="24" r="22" fill="#f0ede4" />
              <path d="M24 2 a22 22 0 0 0 0 44 a11 11 0 0 1 0 -22 a11 11 0 0 0 0 -22 z" fill="#1a1a1a" />
              <circle cx="24" cy="13" r="3.4" fill="#f0ede4" />
              <circle cx="24" cy="35" r="3.4" fill="#1a1a1a" />
            </svg>
          </span>
          Yin Yang Puzzle
        </button>
      </h1>

      {design ? <DesignMode /> : <PlayMode shared={shared} />}
    </div>
  )
}

export default App

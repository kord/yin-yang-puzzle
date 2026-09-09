import { useEffect, useMemo, useState } from 'react'
import DesignMode from './DesignMode'
import PlayMode from './PlayMode'
import { decodePuzzle } from './puzzle/encode'
import type { SharedPuzzle } from './puzzle/types'
import './App.css'

type Mode = 'design' | 'play'

/** Read a shared puzzle from the `?p=` query param, if any. */
function parseShared(): SharedPuzzle | null {
    const p = new URLSearchParams(window.location.search).get('p')
    if (!p) return null
    const givens = decodePuzzle(p)
    if (!givens) return null
    return { encoded: p, givens }
}

function App() {
    const shared = useMemo(parseShared, [])
    const [mode, setMode] = useState<Mode>('play')

    // A share link always lands in play mode, regardless of how it's opened.
    useEffect(() => {
        if (shared) setMode('play')
    }, [shared])

    const reloadHome = () => {
        // Full page reload back to the bare path, clearing any `?p=` share state.
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

            <nav className="app__modes">
                <button
                    type="button"
                    className={`app__mode ${mode === 'design' ? 'app__mode--active' : ''}`}
                    onClick={() => setMode('design')}
                >
                    Design
                </button>
                <button
                    type="button"
                    className={`app__mode ${mode === 'play' ? 'app__mode--active' : ''}`}
                    onClick={() => setMode('play')}
                >
                    Play
                </button>
            </nav>

            {mode === 'design' ? <DesignMode /> : <PlayMode shared={shared} />}
        </div>
    )
}

export default App

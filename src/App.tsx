import { useState } from 'react'
import DesignMode from './DesignMode'
import PlayMode from './PlayMode'
import './App.css'

type Mode = 'design' | 'play'

function App() {
  const [mode, setMode] = useState<Mode>('design')

  return (
    <div className="app">
      <h1>Yin Yang Puzzle</h1>

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

      {mode === 'design' ? <DesignMode /> : <PlayMode />}
    </div>
  )
}

export default App

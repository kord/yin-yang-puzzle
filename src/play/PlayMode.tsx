import { useEffect, useState } from 'react'
import type { SharedPuzzle } from '../puzzle/types'
import { dailyDate } from '../puzzle/seed'
import { getSolvedDates } from '../storage'
import { SIZES, usePuzzleSession } from './usePuzzleSession'
import { usePuzzleBoard } from './usePuzzleBoard'
import Confetti from '../Confetti'
import MonthPicker from '../MonthPicker'
import HintModal from '../HintModal'
import '../App.css'

// Only show the debug Status panel during development; hide it in production.
const SHOW_STATUS_BAR = import.meta.env.DEV

function PlayMode({ shared }: { shared?: SharedPuzzle | null }) {
    const {
        size,
        setSize,
        date,
        selectDate,
        generating,
        puzzle,
        status,
        setStatus,
        completedSizes,
        refreshCompletedSizes,
        cellsRef,
        solvedRef,
        historyStore,
        historyKey,
        saveNow,
        saveSoon,
    } = usePuzzleSession(shared ?? null)

    const [celebrate, setCelebrate] = useState(false)
    const [showHint, setShowHint] = useState(false)

    const board = usePuzzleBoard({
        size,
        puzzle,
        cellsRef,
        solvedRef,
        historyStore,
        historyKey,
        onEdit: saveSoon,
        onSolved: (c) => {
            setStatus('Solved!')
            setCelebrate(c)
            // Persist *now*. The solved flag has to survive a closed tab, and
            // nothing else would save it: the board is read-only once solved, so
            // no further edit can trigger the debounced save, and the unmount
            // flush does not run on every kind of navigation. `saveNow` is also
            // what appends the date to the per-size solved list that the date
            // picker and size buttons read back.
            saveNow()
            refreshCompletedSizes()
        },
        onRestore: (solved) => {
            setStatus(solved ? 'Solved!' : '')
            setCelebrate(false)
            saveNow()
        },
    })

    // A new puzzle means a fresh, un-celebrated board.
    useEffect(() => {
        setCelebrate(false)
    }, [puzzle])

    // Undo with Z, redo with Shift+Z, reset with R. The board handlers read from
    // refs, so a single listener installed once stays correct across re-renders.
    // Redo is intentionally not advertised anywhere in the UI.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase()
            const plain = !e.ctrlKey && !e.metaKey && !e.altKey
            if (k === 'z' && plain && !e.shiftKey) board.undo()
            else if (k === 'z' && plain && e.shiftKey) board.redo()
            else if (k === 'r' && plain && !e.shiftKey) board.reset()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Show a busy cursor while a puzzle is being generated.
    useEffect(() => {
        if (generating) document.body.classList.add('cursor-busy')
        else document.body.classList.remove('cursor-busy')
        return () => document.body.classList.remove('cursor-busy')
    }, [generating])

    return (
        <div className="app__layout">
            <div ref={board.containerRef} className="app__grid" />

            <aside className="app__panel">
                <h2 className="app__heading">Play</h2>

                <div className="app__controls">
                    <button
                        type="button"
                        className="app__button"
                        onClick={board.undo}
                        disabled={generating || !board.canUndo}
                    >
                        Undo (Z)
                    </button>
                    <button type="button" className="app__button" onClick={board.reset} disabled={generating}>
                        Reset (R)
                    </button>
                </div>

                {shared ? (
                    <div className="app__datecontrol">
                        <span className="app__datelabel">Shared Puzzle</span>
                    </div>
                ) : (
                    <div className="app__datecontrol">
                        <span className="app__datelabel">Daily Puzzle</span>
                        <MonthPicker
                            value={date}
                            max={dailyDate()}
                            disabled={generating}
                            onSelect={selectDate}
                            isCompleted={(d) => SIZES.every((s) => getSolvedDates(localStorage, s).includes(d))}
                        />
                    </div>
                )}

                {!shared && (
                    <div className="app__sizes">
                        {SIZES.map((s) => (
                            <button
                                key={s}
                                type="button"
                                className={`app__sizebtn${s === size ? ' app__sizebtn--active' : ''}${completedSizes.includes(s) ? ' app__sizebtn--completed' : ''}`}
                                disabled={generating}
                                onClick={() => setSize(s)}
                            >
                                {s}×{s}
                            </button>
                        ))}
                    </div>
                )}

                <p className="app__text">
                    Fill every cell <strong>black</strong> or <strong>white</strong> so each color
                    forms one connected group and no 2×2 block is all one color.
                </p>
                <button type="button" className="app__hint" onClick={() => setShowHint(true)}>
                    Hints
                </button>
                <p className="app__text">
                    Idea from <a href="https://www.puzzle-yin-yang.com/">Here</a>
                </p>

                {SHOW_STATUS_BAR && (
                    <>
                        <h2 className="app__heading">Status</h2>
                        <p className="app__status">
                            {generating ? status || 'Generating…' : status || (puzzle ? '—' : '')}
                        </p>
                    </>
                )}
            </aside>

            <Confetti active={celebrate} />
            {showHint && <HintModal onClose={() => setShowHint(false)} />}
        </div>
    )
}

export default PlayMode

import { useEffect, useRef, useState } from 'react'
import { PuzzleGrid, type ElementRef } from './PuzzleGrid'
import type { UserCell, YinYangPuzzleDefinition } from './puzzle/types'
import { dailyDate, seedFromDateString } from './puzzle/seed'
import { loadDay, saveDay, getSolvedDates, emptyUserCells } from './storage'
import Confetti from './Confetti'
import MonthPicker from './MonthPicker'
import './App.css'

const SIZES = Array.from({ length: 9 }, (_, i) => i + 4) // 4x4 .. 12x12

type GenResponse = { id: number; puzzle: YinYangPuzzleDefinition; date?: string; prefetch?: boolean }

const DEFAULT_SIZE = 6
function PlayMode() {
    const [size, setSize] = useState(6)
    const [generating, setGenerating] = useState(false)
    const [puzzle, setPuzzle] = useState<YinYangPuzzleDefinition | null>(null)
    const [status, setStatus] = useState('')
    const [date, setDate] = useState(dailyDate())
    const [celebrate, setCelebrate] = useState(false)
    const [canUndo, setCanUndo] = useState(false)
    const [completedSizes, setCompletedSizes] = useState<number[]>([])

    const containerRef = useRef<HTMLDivElement | null>(null)
    const gridRef = useRef<PuzzleGrid | null>(null)
    const sizeRef = useRef(size)
    const puzzleRef = useRef<YinYangPuzzleDefinition | null>(null)
    const workerRef = useRef<Worker | null>(null)
    const requestIdRef = useRef(0)
    const updatingRef = useRef(false)
    const dateRef = useRef(dailyDate())
    const userCellsRef = useRef<UserCell[]>([])
    const solvedRef = useRef(false)
    const saveTimerRef = useRef<number | null>(null)
    const historyRef = useRef<{ cells: UserCell[]; solved: boolean }[]>([])
    const prefetchIdRef = useRef(0)

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
            // A background pre-generation for the next size: cache it silently.
            if (e.data.prefetch) {
                const n = e.data.puzzle.size.width
                const d = e.data.date ?? dateRef.current
                saveDay(localStorage, n, d, {
                    puzzle: e.data.puzzle,
                    userCells: emptyUserCells(n * n),
                    solved: false,
                })
                return
            }
            if (e.data.id !== requestIdRef.current) return // ignore stale results
            setGenerating(false)
            setPuzzle(e.data.puzzle)
            solvedRef.current = false
            setCelebrate(false)
            setStatus('')
            const n = e.data.puzzle.size.width
            userCellsRef.current = emptyUserCells(n * n)
            saveDay(localStorage, n, dateRef.current, {
                puzzle: e.data.puzzle,
                userCells: userCellsRef.current,
                solved: false,
            })
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
            paintButtons: {
                square: {
                    0: ['untouched', 'activated', 'inactivated'],
                    2: ['untouched', 'inactivated', 'activated'],
                },
            },
            onStateChange: () => {
                if (updatingRef.current) return
                commitHistory()
                checkCompletion()
                userCellsRef.current = readUserCells()
                scheduleSave()
            },
        })
        gridRef.current = grid
        grid.mount(container)

        const pz = puzzleRef.current
        if (pz && pz.size.width === size) {
            updatingRef.current = true
            const cells = userCellsRef.current
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    const ref: ElementRef = { kind: 'square', row: r, col: c }
                    if (pz.fixedWhites[r][c]) {
                        grid.setState(ref, 'inactivated')
                        grid.setGiven(ref, true)
                        grid.setReadonly(ref, true)
                    } else if (pz.fixedBlacks[r][c]) {
                        grid.setState(ref, 'activated')
                        grid.setGiven(ref, true)
                        grid.setReadonly(ref, true)
                    } else {
                        const uc = cells[r * size + c]
                        if (uc === 'b') grid.setState(ref, 'activated')
                        else if (uc === 'w') grid.setState(ref, 'inactivated')
                    }
                }
            }
            if (solvedRef.current) {
                for (let r = 0; r < size; r++) {
                    for (let c = 0; c < size; c++) {
                        grid.setReadonly({ kind: 'square', row: r, col: c }, true)
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

    // Load a puzzle on mount and whenever the size changes.
    useEffect(() => {
        generateDaily(dateRef.current)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [size])

    // Undo with Z and reset with R.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase()
            if (k === 'z' && !e.shiftKey && !e.ctrlKey && !e.metaKey) undo()
            else if (k === 'r' && !e.shiftKey && !e.ctrlKey && !e.metaKey) reset()
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

    // Silently pre-generate the next-size daily puzzle in the background.
    useEffect(() => {
        if (puzzle) prefetchNext()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [puzzle, size])

    // Mark sizes completed for the currently selected date.
    useEffect(() => {
        refreshCompletedSizes()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date])

    // Flush any pending daily progress when leaving Play mode.
    useEffect(() => {
        return () => {
            if (saveTimerRef.current !== null) {
                clearTimeout(saveTimerRef.current)
                saveTimerRef.current = null
            }
            const pz = puzzleRef.current
            if (pz) {
                saveDay(localStorage, sizeRef.current, dateRef.current, {
                    puzzle: pz,
                    userCells: userCellsRef.current,
                    solved: solvedRef.current,
                    solvedAt: solvedRef.current ? Date.now() : undefined,
                })
            }
        }
    }, [])

    function generateDaily(d: string) {
        dateRef.current = d
        setDate(d)
        const n = sizeRef.current
        const record = loadDay(localStorage, n, d)
        if (record && record.puzzle && record.puzzle.size.width === n) {
            userCellsRef.current = record.userCells
            solvedRef.current = record.solved
            historyRef.current = []
            setCanUndo(false)
            setGenerating(false)
            setPuzzle(record.puzzle)
            setStatus(record.solved ? 'Solved!' : '')
            setCelebrate(false)
            return
        }

        userCellsRef.current = emptyUserCells(n * n)
        solvedRef.current = false
        historyRef.current = []
        setCanUndo(false)
        const id = ++requestIdRef.current
        setGenerating(true)
        setCelebrate(false)
        setStatus('Loading puzzle…')
        workerRef.current?.postMessage({ id, size: { width: n, height: n }, seed: seedFromDateString(d) })
    }

    /** Changing dates always starts at the smallest (4×4) puzzle. */
    function selectDate(d: string) {
        if (sizeRef.current === DEFAULT_SIZE) {
            generateDaily(d)
        } else {
            // Reset to 4×4; the [size] effect reloads for the new date.
            sizeRef.current = DEFAULT_SIZE
            setSize(DEFAULT_SIZE)
            dateRef.current = d
            setDate(d)
        }
    }

    /**
     * Pre-generate the puzzle one size larger than the one being played so it is
     * ready when the user scales up. Only caches daily puzzles (deterministic per
     * date) and never sets `generating`, so the busy cursor is not shown.
     */
    function prefetchNext() {
        const n = sizeRef.current
        const next = n + 1
        const max = SIZES[SIZES.length - 1]
        if (next > max) return
        const d = dateRef.current
        if (loadDay(localStorage, next, d)) return // already cached
        const id = ++prefetchIdRef.current
        workerRef.current?.postMessage({
            id,
            size: { width: next, height: next },
            seed: seedFromDateString(d),
            date: d,
            prefetch: true,
        })
    }

    function readUserCells(): UserCell[] {
        const grid = gridRef.current
        const pz = puzzleRef.current
        const n = sizeRef.current
        const cells: UserCell[] = []
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                if (pz && (pz.fixedWhites[r][c] || pz.fixedBlacks[r][c])) {
                    cells.push('.')
                    continue
                }
                const state = grid ? grid.getState({ kind: 'square', row: r, col: c }) : 'untouched'
                cells.push(state === 'activated' ? 'b' : state === 'inactivated' ? 'w' : '.')
            }
        }
        return cells
    }

    function saveProgress() {
        const pz = puzzleRef.current
        if (!pz) return
        saveDay(localStorage, sizeRef.current, dateRef.current, {
            puzzle: pz,
            userCells: userCellsRef.current,
            solved: solvedRef.current,
            solvedAt: solvedRef.current ? Date.now() : undefined,
        })
    }

    function scheduleSave() {
        if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = window.setTimeout(() => {
            saveTimerRef.current = null
            saveProgress()
        }, 250)
    }

    function commitHistory() {
        historyRef.current.push({ cells: userCellsRef.current.slice(), solved: solvedRef.current })
        if (historyRef.current.length > 200) historyRef.current.shift()
        setCanUndo(true)
    }

    function restoreOpenCells(cells: UserCell[], solved = false) {
        const grid = gridRef.current
        const pz = puzzleRef.current
        if (!grid || !pz) return
        const n = sizeRef.current
        if (saveTimerRef.current !== null) {
            clearTimeout(saveTimerRef.current)
            saveTimerRef.current = null
        }
        updatingRef.current = true
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                if (pz.fixedWhites[r][c] || pz.fixedBlacks[r][c]) continue
                const ref: ElementRef = { kind: 'square', row: r, col: c }
                grid.setReadonly(ref, false)
                const uc = cells[r * n + c]
                if (uc === 'b') grid.setState(ref, 'activated')
                else if (uc === 'w') grid.setState(ref, 'inactivated')
                else grid.setState(ref, 'untouched')
            }
        }
        updatingRef.current = false
        userCellsRef.current = cells.slice()
        solvedRef.current = solved
        setStatus(solved ? 'Solved!' : '')
        setCelebrate(false)
        if (solved) {
            for (let r = 0; r < n; r++) {
                for (let c = 0; c < n; c++) {
                    grid.setReadonly({ kind: 'square', row: r, col: c }, true)
                }
            }
        }
        saveProgress()
    }

    function undo() {
        const hist = historyRef.current
        if (!hist.length) return
        const prev = hist.pop()!
        restoreOpenCells(prev.cells, prev.solved)
        setCanUndo(hist.length > 0)
    }

    function reset() {
        const cells = userCellsRef.current
        if (!cells.some((c) => c !== '.')) return // nothing to reset
        commitHistory() // make the reset undoable
        const n = sizeRef.current
        restoreOpenCells(emptyUserCells(n * n))
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
        solvedRef.current = true
        setStatus('Solved!')
        setCelebrate(true)
        updatingRef.current = true
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                grid.setReadonly({ kind: 'square', row: r, col: c }, true)
            }
        }
        updatingRef.current = false
        refreshCompletedSizes()
    }

    function refreshCompletedSizes() {
        const d = dateRef.current
        const completed = SIZES.filter((s) => {
            if (getSolvedDates(localStorage, s).includes(d)) return true
            // The puzzle currently on screen may not have been persisted yet.
            return s === sizeRef.current && solvedRef.current
        })
        setCompletedSizes(completed)
    }

    return (
        <div className="app__layout">
            <div ref={containerRef} className="app__grid" />

            <aside className="app__panel">
                <h2 className="app__heading">Play</h2>

                <div className="app__controls">
                    <button
                        type="button"
                        className="app__undo"
                        onClick={undo}
                        disabled={generating || !canUndo}
                    >
                        Undo (Z)
                    </button>
                    <button type="button" className="app__undo" onClick={reset} disabled={generating}>
                        Reset (R)
                    </button>
                </div>

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
                {/* 
                <p className="app__text">
                    <strong>Left-click</strong> cycles
                    <br />
                    <code className="app__code">empty → black → white</code>.
                </p>
                <p className="app__text">
                    <strong>Right-click</strong> cycles
                    <br />
                    <code className="app__code">empty → white → black</code>.
                </p>
                <p className="app__text">
                    <strong>Z</strong> undoes · <strong>R</strong> resets.
                </p> */}
                <p className="app__text">
                    Fill every cell <strong>black</strong> or <strong>white</strong> so each
                    color forms one connected group and no 2×2 block  is all one color.
                </p>

                <h2 className="app__heading">Status</h2>
                <p className="app__status">
                    {generating ? status || 'Generating…' : status || (puzzle ? '—' : '')}
                </p>
            </aside>

            <Confetti active={celebrate} />
        </div>
    )
}

export default PlayMode

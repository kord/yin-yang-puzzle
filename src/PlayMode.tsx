import { useEffect, useRef, useState } from 'react'
import { PuzzleGrid, type ElementRef } from './PuzzleGrid'
import type { SharedPuzzle, UserCell, YinYangPuzzleDefinition } from './puzzle/types'
import { dailyDate, seedFromDateString } from './puzzle/seed'
import { loadDay, saveDay, loadShared, saveShared, getSolvedDates, emptyUserCells } from './storage'
import Confetti from './Confetti'
import MonthPicker from './MonthPicker'
import HintModal from './HintModal'
import './App.css'

const SIZES = Array.from({ length: 9 }, (_, i) => i + 4) // 4x4 .. 12x12

// Only show the debug Status panel during development; hide it in production.
const SHOW_STATUS_BAR = import.meta.env.DEV

type GenResponse = { id: number; puzzle: YinYangPuzzleDefinition; date?: string; prefetch?: boolean }

const DEFAULT_SIZE = 6
function PlayMode({ shared }: { shared?: SharedPuzzle | null }) {
    const [size, setSize] = useState(shared ? shared.givens.size.width : DEFAULT_SIZE)
    const [generating, setGenerating] = useState(false)
    const [puzzle, setPuzzle] = useState<YinYangPuzzleDefinition | null>(null)
    const [status, setStatus] = useState('')
    const [date, setDate] = useState(dailyDate())
    const [celebrate, setCelebrate] = useState(false)
    const [canUndo, setCanUndo] = useState(false)
    const [completedSizes, setCompletedSizes] = useState<number[]>([])
    const [showHint, setShowHint] = useState(false)

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
    const sharedRef = useRef<SharedPuzzle | null>(shared ?? null)
    const encodedRef = useRef<string>(shared?.encoded ?? '')

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
            const pz = e.data.puzzle
            setGenerating(false)
            setPuzzle(pz)
            solvedRef.current = false
            setCelebrate(false)
            setStatus('')
            const n = pz.size.width
            userCellsRef.current = emptyUserCells(n * n)
            saveDay(localStorage, n, dateRef.current, {
                puzzle: pz,
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
                updateViolations()
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
            updateViolations()
            // A resumed board may be the full, correct solution even if it was
            // saved without the `solved` flag (e.g. a prior save missed it).
            // Re-validate and mark it solved, but don't re-play confetti on load.
            if (!solvedRef.current) checkCompletion(false)
        }

        return () => {
            grid.destroy()
            gridRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [size, puzzle])

    // Load a puzzle on mount and whenever the size changes.
    useEffect(() => {
        if (sharedRef.current) buildSharedPuzzle()
        else generateDaily(dateRef.current)
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
        if (puzzle && !sharedRef.current) prefetchNext()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [puzzle, size])

    // Mark sizes completed for the currently selected date.
    useEffect(() => {
        refreshCompletedSizes()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date])

    // Flush any pending progress when leaving Play mode.
    useEffect(() => {
        return () => {
            if (saveTimerRef.current !== null) {
                clearTimeout(saveTimerRef.current)
                saveTimerRef.current = null
            }
            const pz = puzzleRef.current
            if (pz) {
                const record = {
                    puzzle: pz,
                    userCells: userCellsRef.current,
                    solved: solvedRef.current,
                    solvedAt: solvedRef.current ? Date.now() : undefined,
                }
                if (sharedRef.current) saveShared(localStorage, encodedRef.current, record)
                else saveDay(localStorage, sizeRef.current, dateRef.current, record)
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

    /** Load a puzzle from a share link, restoring saved progress if any. */
    function buildSharedPuzzle() {
        const shared = sharedRef.current
        if (!shared) return
        const givens = shared.givens
        const n = givens.size.width
        const record = loadShared(localStorage, encodedRef.current)
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

        // A share link is a unique puzzle by construction, so there's no need to
        // solve for a recorded `solution` — completion is validated by the rules
        // alone. Adopt the given clues directly (no worker round-trip). We cast
        // because a shared puzzle carries no computed solution; the app never
        // reads `puzzle.solution`, so this is safe.
        const puzzle = {
            size: givens.size,
            fixedWhites: givens.fixedWhites,
            fixedBlacks: givens.fixedBlacks,
        } as YinYangPuzzleDefinition
        userCellsRef.current = emptyUserCells(n * n)
        solvedRef.current = false
        historyRef.current = []
        setCanUndo(false)
        setGenerating(false)
        setPuzzle(puzzle)
        setStatus('')
        setCelebrate(false)
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
        const record = {
            puzzle: pz,
            userCells: userCellsRef.current,
            solved: solvedRef.current,
            solvedAt: solvedRef.current ? Date.now() : undefined,
        }
        if (sharedRef.current) saveShared(localStorage, encodedRef.current, record)
        else saveDay(localStorage, sizeRef.current, dateRef.current, record)
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
        updateViolations()
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

    function checkCompletion(celebrate = true) {
        const grid = gridRef.current
        const pz = puzzleRef.current
        if (!grid || !pz) return
        const n = sizeRef.current

        const isWhite: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false))
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const state = grid.getState({ kind: 'square', row: r, col: c })
                if (state === 'untouched') return // board not yet full
                isWhite[r][c] = state === 'inactivated'
            }
        }

        // Accept any complete, rule-valid Yin-Yang rather than a board that exactly
        // matches the stored `solution`. A stale/non-unique puzzle in storage can
        // have a valid answer that differs from its recorded solution, so requiring
        // only the actual rules (full, no 2×2, one connected group per colour) is
        // more robust — and is equivalent for genuinely unique puzzles.
        if (hasMonochrome2x2(isWhite)) return
        if (!isColorConnected(isWhite, true) || !isColorConnected(isWhite, false)) return

        // The board is a valid Yin-Yang solution.
        solvedRef.current = true
        setStatus('Solved!')
        setCelebrate(celebrate)
        updatingRef.current = true
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                grid.setReadonly({ kind: 'square', row: r, col: c }, true)
            }
        }
        updatingRef.current = false
        refreshCompletedSizes()
    }

    /**
     * Find every 2×2 block whose four stones are the same (non-empty) color and
     * tell the grid to halo those stones red. Re-run after any board change.
     */
    function updateViolations() {
        const grid = gridRef.current
        if (!grid) return
        const n = sizeRef.current
        const color = (r: number, c: number): 'b' | 'w' | null => {
            const state = grid.getState({ kind: 'square', row: r, col: c })
            if (state === 'activated') return 'b'
            if (state === 'inactivated') return 'w'
            return null
        }
        const seen = new Set<string>()
        const violations: ElementRef[] = []
        for (let r = 0; r < n - 1; r++) {
            for (let c = 0; c < n - 1; c++) {
                const a = color(r, c)
                if (!a) continue
                if (color(r, c + 1) === a && color(r + 1, c) === a && color(r + 1, c + 1) === a) {
                    const pts = [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]] as const
                    for (const [rr, cc] of pts) {
                        const key = `${rr}:${cc}`
                        if (!seen.has(key)) {
                            seen.add(key)
                            violations.push({ kind: 'square', row: rr, col: cc })
                        }
                    }
                }
            }
        }
        grid.setViolations(violations)
    }

    function refreshCompletedSizes() {
        if (sharedRef.current) {
            setCompletedSizes([])
            return
        }
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
                    color forms one connected group and no 2×2 block is all one color.
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

/** True if any 2×2 block is a single colour (a Yin-Yang violation). */
function hasMonochrome2x2(isWhite: boolean[][]): boolean {
    const n = isWhite.length
    for (let r = 0; r < n - 1; r++) {
        for (let c = 0; c < n - 1; c++) {
            const a = isWhite[r][c]
            if (isWhite[r][c + 1] === a && isWhite[r + 1][c] === a && isWhite[r + 1][c + 1] === a) {
                return true
            }
        }
    }
    return false
}

/** True if all cells of one colour (white when `white`, else black) form a single connected group. */
function isColorConnected(isWhite: boolean[][], white: boolean): boolean {
    const n = isWhite.length
    const visited = Array.from({ length: n }, () => Array(n).fill(false))

    let start: [number, number] | null = null
    for (let r = 0; r < n && !start; r++) {
        for (let c = 0; c < n; c++) {
            if (isWhite[r][c] === white) {
                start = [r, c]
                break
            }
        }
    }
    if (!start) return true

    const stack: [number, number][] = [start]
    let reached = 0
    while (stack.length) {
        const [r, c] = stack.pop()!
        if (r < 0 || c < 0 || r >= n || c >= n || visited[r][c] || isWhite[r][c] !== white) continue
        visited[r][c] = true
        reached++
        stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1])
    }

    let total = 0
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (isWhite[r][c] === white) total++
        }
    }
    return reached === total
}

export default PlayMode


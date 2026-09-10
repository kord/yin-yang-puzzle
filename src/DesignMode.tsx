import { useEffect, useRef, useState } from 'react'
import { PuzzleGrid, type ElementRef, type ElementState } from './PuzzleGrid'
import type { Extension, YinYangPuzzlePartialDefinition } from './puzzle/types'
import { encodePuzzle } from './puzzle/encode'
import { range } from './puzzle/grid'
import type { SolveResponse } from './puzzle/messages'
import './App.css'

const SIZES = range(4, 20) // 4x4 .. 20x20

type Marks = { whites: boolean[][]; blacks: boolean[][] }

function blankMarks(n: number): Marks {
    return {
        whites: Array.from({ length: n }, () => Array(n).fill(false)),
        blacks: Array.from({ length: n }, () => Array(n).fill(false)),
    }
}

function cloneMarks(m: Marks): Marks {
    return { whites: m.whites.map((r) => r.slice()), blacks: m.blacks.map((r) => r.slice()) }
}

function DesignMode() {
    const [size, setSize] = useState(6)
    const [historyLen, setHistoryLen] = useState(0)
    const [showImplications, setShowImplications] = useState(true)
    const [unique, setUnique] = useState(false)
    const [copied, setCopied] = useState(false)
    const [hasMarks, setHasMarks] = useState(false)

    const containerRef = useRef<HTMLDivElement | null>(null)
    const gridRef = useRef<PuzzleGrid | null>(null)
    const sizeRef = useRef(size)
    const updatingRef = useRef(false)
    const timerRef = useRef<number | null>(null)
    const statusRef = useRef<HTMLSpanElement | null>(null)
    const historyRef = useRef<Marks[]>([])
    const marksRef = useRef<Marks>(blankMarks(size))
    const workerRef = useRef<Worker | null>(null)
    const requestIdRef = useRef(0)
    // Mirror of `showImplications` for the (stale-closure) worker/event callbacks.
    const showImplicationsRef = useRef(true)

    useEffect(() => {
        sizeRef.current = size
    }, [size])

    // Solve in a Web Worker so the UI never blocks on the SAT solver.
    useEffect(() => {
        const worker = new Worker(new URL('./puzzle/solver.worker.ts', import.meta.url), {
            type: 'module',
        })
        workerRef.current = worker
        worker.onmessage = (e: MessageEvent<SolveResponse>) => {
            if (e.data.id !== requestIdRef.current) return // ignore stale results
            handleSolveResult(e.data.extensions)
        }
        return () => {
            worker.terminate()
            workerRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Re-run the deduction/hints when the show-implications toggle changes.
    useEffect(() => {
        showImplicationsRef.current = showImplications
        recompute(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showImplications])

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
            onStateChange: (ref, state) => {
                if (updatingRef.current) return
                if (statusRef.current) statusRef.current.textContent = `(${ref.row},${ref.col}) → ${state}`
                setUnique(false) // a fresh placement invalidates any prior uniqueness
                scheduleRecompute()
            },
        })
        gridRef.current = grid
        historyRef.current = []
        marksRef.current = blankMarks(size)
        requestIdRef.current++ // drop any in-flight solve from the old grid
        setHistoryLen(0)
        grid.mount(container)
        recompute(false)

        const onKey = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase()
            if (k === 'z' && !e.shiftKey) undo()
            else if (k === 'r' && !e.shiftKey) reset()
        }
        window.addEventListener('keydown', onKey)

        return () => {
            window.removeEventListener('keydown', onKey)
            if (timerRef.current !== null) clearTimeout(timerRef.current)
            timerRef.current = null
            grid.destroy()
            gridRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [size])

    function readMarks(): Marks {
        const n = sizeRef.current
        const whites = Array.from({ length: n }, () => Array(n).fill(false))
        const blacks = Array.from({ length: n }, () => Array(n).fill(false))
        const grid = gridRef.current
        if (!grid) return { whites, blacks }
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const ref: ElementRef = { kind: 'square', row: r, col: c }
                if (grid.getInferred(ref)) continue
                const state = grid.getState(ref)
                if (state === 'inactivated') whites[r][c] = true
                else if (state === 'activated') blacks[r][c] = true
            }
        }
        return { whites, blacks }
    }

    function recompute(recordHistory = true) {
        const grid = gridRef.current
        if (!grid) return
        const n = sizeRef.current
        const marks = readMarks()

        if (recordHistory) {
            historyRef.current.push(cloneMarks(marksRef.current))
            if (historyRef.current.length > 200) historyRef.current.shift()
            setHistoryLen(historyRef.current.length)
        }
        marksRef.current = marks

        const hasMark =
            marks.whites.some((row) => row.some(Boolean)) ||
            marks.blacks.some((row) => row.some(Boolean))
        setHasMarks(hasMark)

        // If implications are hidden, skip the (slow) solver and clear any hints.
        if (!showImplicationsRef.current) {
            updatingRef.current = true
            grid.applyHints([])
            updatingRef.current = false
            setUnique(false)
            if (statusRef.current) statusRef.current.textContent = 'Implications hidden'
            return
        }

        // With no placements there is nothing to deduce, so skip the (slow) solve.
        if (!hasMark) {
            updatingRef.current = true
            grid.applyHints([])
            updatingRef.current = false
            setUnique(false)
            if (statusRef.current) statusRef.current.textContent = '—'
            return
        }

        const puzzle: YinYangPuzzlePartialDefinition = {
            size: { width: n, height: n },
            fixedWhites: marks.whites,
            fixedBlacks: marks.blacks,
        }

        const id = ++requestIdRef.current
        setUnique(false)
        if (statusRef.current) statusRef.current.textContent = 'Solving…'
        workerRef.current?.postMessage({ id, puzzle })
    }

    function handleSolveResult(extensions: Extension) {
        const grid = gridRef.current
        if (!grid) return
        const n = sizeRef.current

        const hints: { ref: ElementRef; state: ElementState }[] = []
        let noSolution = false
        let multiple = false
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const p = extensions.possibilities[r][c]
                if (p.fixed) continue
                if (!p.whitePossible && !p.blackPossible) noSolution = true
                if (p.whitePossible && p.blackPossible) multiple = true
                if (p.whitePossible && !p.blackPossible) {
                    hints.push({ ref: { kind: 'square', row: r, col: c }, state: 'inactivated' })
                } else if (p.blackPossible && !p.whitePossible) {
                    hints.push({ ref: { kind: 'square', row: r, col: c }, state: 'activated' })
                }
            }
        }

        const show = showImplicationsRef.current
        updatingRef.current = true
        grid.applyHints(show ? hints : [])
        updatingRef.current = false

        setUnique(show && !noSolution && !multiple)

        if (statusRef.current) {
            if (!show) {
                statusRef.current.textContent = 'Implications hidden'
            } else if (noSolution) {
                statusRef.current.textContent = 'No solution'
            } else if (multiple) {
                statusRef.current.textContent = 'Multiple solutions'
            } else {
                statusRef.current.textContent = 'Unique solution'
            }
        }
    }

    function scheduleRecompute() {
        if (timerRef.current !== null) clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null
            recompute(true)
        }, 60)
    }

    function undo() {
        const hist = historyRef.current
        if (!hist.length) return
        const prev = cloneMarks(hist.pop()!)
        const grid = gridRef.current
        if (!grid) return
        const n = sizeRef.current

        updatingRef.current = true
        grid.reset()
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                if (prev.whites[r][c]) grid.setState({ kind: 'square', row: r, col: c }, 'inactivated')
                else if (prev.blacks[r][c]) grid.setState({ kind: 'square', row: r, col: c }, 'activated')
            }
        }
        updatingRef.current = false

        setHistoryLen(hist.length)
        marksRef.current = prev
        recompute(false)
        if (statusRef.current) statusRef.current.textContent = 'Undo'
    }

    function reset() {
        const marks = readMarks()
        const hasMark =
            marks.whites.some((row) => row.some(Boolean)) ||
            marks.blacks.some((row) => row.some(Boolean))
        if (!hasMark) return

        // Commit the current board so the reset is undoable (Z reverts it).
        historyRef.current.push(cloneMarks(marks))
        if (historyRef.current.length > 200) historyRef.current.shift()
        setHistoryLen(historyRef.current.length)

        const grid = gridRef.current
        if (!grid) return
        const n = sizeRef.current
        updatingRef.current = true
        grid.reset()
        updatingRef.current = false
        marksRef.current = blankMarks(n)
        setHasMarks(false)
        recompute(false)
        if (statusRef.current) statusRef.current.textContent = 'Reset'
    }

    function copyShareLink() {
        const n = sizeRef.current
        const marks = readMarks()
        const link = `${window.location.origin}${window.location.pathname}?p=${encodePuzzle({
            size: { width: n, height: n },
            fixedWhites: marks.whites,
            fixedBlacks: marks.blacks,
        })}`
        navigator.clipboard
            .writeText(link)
            .then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1500)
            })
            .catch(() => {
                if (statusRef.current) statusRef.current.textContent = 'Could not copy link'
            })
    }

    return (
        <div className="app__layout">
            <div ref={containerRef} className="app__grid" />

            <aside className="app__panel">
                <h2 className="app__heading">Designer Controls</h2>

                <div className="app__controls">
                    <button
                        type="button"
                        className="app__button"
                        onClick={undo}
                        disabled={historyLen === 0}
                    >
                        Undo (Z)
                    </button>
                    <button
                        type="button"
                        className="app__button"
                        onClick={reset}
                        disabled={!hasMarks}
                    >
                        Reset
                    </button>
                    <label className="app__sizelabel">
                        Size
                        <select
                            className="app__size"
                            value={size}
                            onChange={(e) => setSize(Number(e.target.value))}
                        >
                            {SIZES.map((s) => (
                                <option key={s} value={s}>
                                    {s}×{s}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="app__toggle">
                        <input
                            type="checkbox"
                            checked={showImplications}
                            onChange={(e) => setShowImplications(e.target.checked)}
                        />
                        Show implications
                    </label>
                </div>

                <div className="app__share">
                    <button
                        type="button"
                        className="app__button"
                        onClick={copyShareLink}
                        disabled={!unique}
                    >
                        Share
                    </button>
                    {copied && <span className="app__copied">Link copied!</span>}
                </div>

                <p className="app__text">
                    <strong>Dimmed stones</strong> are the rules' implications of your
                    placements (shown while &ldquo;Show implications&rdquo; is on).
                </p>

                <h2 className="app__heading">Status</h2>
                <p className="app__status"><span ref={statusRef}>—</span></p>
            </aside>
        </div>
    )
}

export default DesignMode

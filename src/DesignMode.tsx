import { useEffect, useRef, useState } from 'react'
import { PuzzleGrid, type ElementRef, type ElementState } from './PuzzleGrid'
import type { Extension, YinYangPuzzlePartialDefinition } from './puzzle/types'
import './App.css'

const SIZES = Array.from({ length: 17 }, (_, i) => i + 4) // 4x4 .. 20x20

type SolveResponse = { id: number; extensions: Extension }

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
            if (e.key.toLowerCase() === 'z' && !e.shiftKey) undo()
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

        // With no placements there is nothing to deduce, so skip the (slow) solve.
        if (!hasMark) {
            updatingRef.current = true
            grid.applyHints([])
            updatingRef.current = false
            if (statusRef.current) statusRef.current.textContent = '—'
            return
        }

        const puzzle: YinYangPuzzlePartialDefinition = {
            size: { width: n, height: n },
            fixedWhites: marks.whites,
            fixedBlacks: marks.blacks,
        }

        const id = ++requestIdRef.current
        if (statusRef.current) statusRef.current.textContent = 'Solving…'
        workerRef.current?.postMessage({ id, puzzle })
    }

    function handleSolveResult(extensions: Extension) {
        const grid = gridRef.current
        if (!grid) return
        const n = sizeRef.current
        const marks = marksRef.current
        const hasMark =
            marks.whites.some((row) => row.some(Boolean)) ||
            marks.blacks.some((row) => row.some(Boolean))

        const hints: { ref: ElementRef; state: ElementState }[] = []
        let anyPossible = false
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const p = extensions.possibilities[r][c]
                if (p.fixed) continue
                if (p.whitePossible || p.blackPossible) anyPossible = true
                if (p.whitePossible && !p.blackPossible) {
                    hints.push({ ref: { kind: 'square', row: r, col: c }, state: 'inactivated' })
                } else if (p.blackPossible && !p.whitePossible) {
                    hints.push({ ref: { kind: 'square', row: r, col: c }, state: 'activated' })
                }
            }
        }

        updatingRef.current = true
        grid.applyHints(hints)
        updatingRef.current = false

        if (statusRef.current) {
            statusRef.current.textContent = hasMark && !anyPossible ? 'No solution' : 'Done'
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

    return (
        <div className="app__layout">
            <div ref={containerRef} className="app__grid" />

            <aside className="app__panel">
                <h2 className="app__heading">Controls</h2>

                <div className="app__controls">
                    <button
                        type="button"
                        className="app__undo"
                        onClick={undo}
                        disabled={historyLen === 0}
                    >
                        Undo (Z)
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
                </div>

                <p className="app__text">
                    <strong>Left-drag</strong> cycles a cell
                    <br />
                    <code className="app__code">empty → black → white</code>.
                </p>
                <p className="app__text">
                    <strong>Right-drag</strong> cycles the other way
                    <br />
                    <code className="app__code">empty → white → black</code>.
                </p>
                <p className="app__text">
                    <strong>Middle-click</strong> (or{' '}
                    <kbd className="app__key">Ctrl</kbd>/<kbd className="app__key">Shift</kbd>+click)
                    clears a stone.
                </p>
                <p className="app__text">
                    <strong>Dimmed stones</strong> are forced by the rules from your
                    placements.
                </p>

                <h2 className="app__heading">Legend</h2>
                <ul className="app__legend">
                    <li className="app__legend-item"><span className="app__swatch app__swatch--untouched" /> empty</li>
                    <li className="app__legend-item"><span className="app__swatch app__swatch--activated" /> black</li>
                    <li className="app__legend-item"><span className="app__swatch app__swatch--inactivated" /> white</li>
                    <li className="app__legend-item"><span className="app__swatch app__swatch--inferred" /> forced (hint)</li>
                </ul>

                <h2 className="app__heading">Status</h2>
                <p className="app__status"><span ref={statusRef}>—</span></p>
            </aside>
        </div>
    )
}

export default DesignMode

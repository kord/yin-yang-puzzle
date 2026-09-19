import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { PuzzleGrid, type ElementRef } from '../PuzzleGrid'
import type { UserCell, YinYangPuzzleDefinition } from '../puzzle/types'
import { emptyUserCells } from '../storage'
import { hasMonochrome2x2, isColorConnected } from '../puzzle/rules'

/** One reversible step: the player's cells and the solved flag at that moment. */
export interface HistoryEntry {
    cells: UserCell[]
    solved: boolean
}

/** Undo/redo stacks for a single puzzle. */
export interface PuzzleHistory {
    past: HistoryEntry[]
    future: HistoryEntry[]
}

interface BoardOptions {
    /** Grid size (n×n). */
    size: number
    /** The puzzle being played (givens), or null while it loads. */
    puzzle: YinYangPuzzleDefinition | null
    /** The player's open cells — owned by the caller so it can be persisted. */
    cellsRef: MutableRefObject<UserCell[]>
    /** Whether the board is solved — owned by the caller. */
    solvedRef: MutableRefObject<boolean>
    /**
     * Per-puzzle undo/redo stacks, keyed by `historyKey`. The caller owns the map
     * so a puzzle's history survives switching to another puzzle and back. It is
     * in-memory only, so it starts empty on every page load.
     */
    historyStore: MutableRefObject<Map<string, PuzzleHistory>>
    /** Identity of the puzzle on screen; null while one is loading. */
    historyKey: string | null
    /** A player edit happened (persist it). */
    onEdit: () => void
    /** The board became a valid solution (`celebrate` is false when resuming). */
    onSolved: (celebrate: boolean) => void
    /** The board was restored by undo/redo/reset (persist immediately). */
    onRestore: (solved: boolean) => void
}

export interface PuzzleBoard {
    containerRef: RefObject<HTMLDivElement | null>
    canUndo: boolean
    canRedo: boolean
    undo: () => void
    /** The counterpart of undo, bound to Shift+Z only — deliberately unlabelled. */
    redo: () => void
    reset: () => void
}

/**
 * Owns the `PuzzleGrid`: mounts it, lays down the given clues and the player's
 * cells, flags 2×2 violations, and provides undo/redo/reset. The caller keeps the
 * cell/solved refs and decides what to do on edit/solve/restore.
 */
export function usePuzzleBoard(options: BoardOptions): PuzzleBoard {
    const {
        size,
        puzzle,
        cellsRef,
        solvedRef,
        historyStore,
        historyKey,
        onEdit,
        onSolved,
        onRestore,
    } = options

    const containerRef = useRef<HTMLDivElement | null>(null)
    const gridRef = useRef<PuzzleGrid | null>(null)
    const updatingRef = useRef(false)
    const historyKeyRef = useRef<string | null>(null)
    /** Used while no puzzle is loaded, so the handlers never crash on a null key. */
    const orphanHistoryRef = useRef<PuzzleHistory>({ past: [], future: [] })
    /** The paint gesture in progress, if any, with the snapshot it will push. */
    const gestureRef = useRef<{ entry: HistoryEntry; changed: boolean } | null>(null)
    const [canUndo, setCanUndo] = useState(false)
    const [canRedo, setCanRedo] = useState(false)

    /**
     * The stacks for the puzzle on screen, created on first use. Reading through
     * the key each time (rather than caching an array) is what lets a puzzle keep
     * its history while another one is being played.
     */
    function stacks(): PuzzleHistory {
        const key = historyKeyRef.current
        if (!key) return orphanHistoryRef.current
        let history = historyStore.current.get(key)
        if (!history) {
            history = { past: [], future: [] }
            historyStore.current.set(key, history)
        }
        return history
    }

    // Mirror the inputs into refs so the imperative handlers stay correct even
    // when captured by long-lived listeners (the keyboard shortcuts).
    const sizeRef = useRef(size)
    const puzzleRef = useRef(puzzle)
    const handlers = useRef({ onEdit, onSolved, onRestore })

    useEffect(() => {
        sizeRef.current = size
    }, [size])
    useEffect(() => {
        puzzleRef.current = puzzle
    }, [puzzle])
    useEffect(() => {
        handlers.current = { onEdit, onSolved, onRestore }
    })

    // Adopt the stacks belonging to whichever puzzle is now on screen. Nothing is
    // cleared here — a puzzle that is returned to finds its own history intact.
    useEffect(() => {
        historyKeyRef.current = historyKey
        const history = stacks()
        setCanUndo(history.past.length > 0)
        setCanRedo(history.future.length > 0)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [historyKey])

    function readCells(): UserCell[] {
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
                    for (const [rr, cc] of [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]]) {
                        const key = `${rr}:${cc}`
                        if (seen.has(key)) continue
                        seen.add(key)
                        violations.push({ kind: 'square', row: rr, col: cc })
                    }
                }
            }
        }
        grid.setViolations(violations)
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
        // Accept any complete, rule-valid Yin-Yang (full, no 2×2, one group each).
        if (hasMonochrome2x2(isWhite)) return
        if (!isColorConnected(isWhite, true) || !isColorConnected(isWhite, false)) return

        solvedRef.current = true
        updatingRef.current = true
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) grid.setReadonly({ kind: 'square', row: r, col: c }, true)
        }
        updatingRef.current = false
        handlers.current.onSolved(celebrate)
    }

    function pushEntry(entry: HistoryEntry) {
        const history = stacks()
        history.past.push(entry)
        if (history.past.length > 200) history.past.shift()
        // Editing after undoing abandons the redo branch, as usual for undo/redo.
        history.future.length = 0
        setCanUndo(true)
        setCanRedo(false)
    }

    /** Record the current board as one undoable step. */
    function commitHistory() {
        pushEntry({ cells: cellsRef.current.slice(), solved: solvedRef.current })
    }

    /**
     * Begin recording a paint gesture. A click-drag changes a cell at a time, but
     * the drag is one undo step, so the snapshot is taken here — before the first
     * change — and pushed once, when the pointer is released.
     */
    function beginGesture() {
        gestureRef.current = {
            entry: { cells: cellsRef.current.slice(), solved: solvedRef.current },
            changed: false,
        }
    }

    function endGesture() {
        const gesture = gestureRef.current
        gestureRef.current = null
        // A press that lands on given/read-only cells changes nothing, so it is not
        // a step — and it must not discard the redo branch either.
        if (!gesture || !gesture.changed) return
        pushEntry(gesture.entry)
    }

    function restore(cells: UserCell[], solved = false) {
        const grid = gridRef.current
        const pz = puzzleRef.current
        if (!grid || !pz) return
        const n = sizeRef.current
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
        if (solved) {
            for (let r = 0; r < n; r++) {
                for (let c = 0; c < n; c++) grid.setReadonly({ kind: 'square', row: r, col: c }, true)
            }
        }
        updatingRef.current = false
        cellsRef.current = cells.slice()
        solvedRef.current = solved
        updateViolations()
        handlers.current.onRestore(solved)
    }

    function undo() {
        const history = stacks()
        if (!history.past.length) return
        history.future.push({ cells: cellsRef.current.slice(), solved: solvedRef.current })
        const prev = history.past.pop()!
        restore(prev.cells, prev.solved)
        setCanUndo(history.past.length > 0)
        setCanRedo(true)
    }

    function redo() {
        const history = stacks()
        if (!history.future.length) return
        history.past.push({ cells: cellsRef.current.slice(), solved: solvedRef.current })
        const next = history.future.pop()!
        restore(next.cells, next.solved)
        setCanUndo(true)
        setCanRedo(history.future.length > 0)
    }

    function reset() {
        if (!cellsRef.current.some((c) => c !== '.')) return // nothing to reset
        commitHistory() // make the reset undoable
        restore(emptyUserCells(sizeRef.current * sizeRef.current))
    }

    // (Re)create the grid and lay down the given clues + the player's cells.
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
                // Mid-drag, only note that the gesture changed something: the step
                // itself is pushed when the pointer is released, so a drag is one
                // undo step instead of one per cell crossed.
                if (gestureRef.current) gestureRef.current.changed = true
                else commitHistory()
                checkCompletion()
                cellsRef.current = readCells()
                updateViolations()
                handlers.current.onEdit()
            },
            onPaintStart: beginGesture,
            onPaintEnd: endGesture,
        })
        gridRef.current = grid
        grid.mount(container)

        if (puzzle && puzzle.size.width === size) {
            updatingRef.current = true
            const cells = cellsRef.current
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    const ref: ElementRef = { kind: 'square', row: r, col: c }
                    if (puzzle.fixedWhites[r][c]) {
                        grid.setState(ref, 'inactivated')
                        grid.setGiven(ref, true)
                        grid.setReadonly(ref, true)
                    } else if (puzzle.fixedBlacks[r][c]) {
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
                    for (let c = 0; c < size; c++) grid.setReadonly({ kind: 'square', row: r, col: c }, true)
                }
            }
            updatingRef.current = false
            updateViolations()
            // A resumed board may be the full, correct solution even if it was saved
            // without the `solved` flag — re-validate and mark it solved (no confetti).
            if (!solvedRef.current) checkCompletion(false)
        }

        return () => {
            grid.destroy()
            gridRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [size, puzzle])

    return { containerRef, canUndo, canRedo, undo, redo, reset }
}

import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { PuzzleGrid, type ElementRef } from '../PuzzleGrid'
import type { UserCell, YinYangPuzzleDefinition } from '../puzzle/types'
import { emptyUserCells } from '../storage'
import { hasMonochrome2x2, isColorConnected } from '../puzzle/rules'

interface BoardOptions {
    /** Grid size (n×n). */
    size: number
    /** The puzzle being played (givens), or null while it loads. */
    puzzle: YinYangPuzzleDefinition | null
    /** The player's open cells — owned by the caller so it can be persisted. */
    cellsRef: MutableRefObject<UserCell[]>
    /** Whether the board is solved — owned by the caller. */
    solvedRef: MutableRefObject<boolean>
    /** A player edit happened (persist it). */
    onEdit: () => void
    /** The board became a valid solution (`celebrate` is false when resuming). */
    onSolved: (celebrate: boolean) => void
    /** The board was restored by undo/reset (persist immediately). */
    onRestore: (solved: boolean) => void
}

export interface PuzzleBoard {
    containerRef: RefObject<HTMLDivElement | null>
    canUndo: boolean
    undo: () => void
    reset: () => void
}

/**
 * Owns the `PuzzleGrid`: mounts it, lays down the given clues and the player's
 * cells, flags 2×2 violations, and provides undo/reset. The caller keeps the
 * cell/solved refs and decides what to do on edit/solve/restore.
 */
export function usePuzzleBoard(options: BoardOptions): PuzzleBoard {
    const { size, puzzle, cellsRef, solvedRef, onEdit, onSolved, onRestore } = options

    const containerRef = useRef<HTMLDivElement | null>(null)
    const gridRef = useRef<PuzzleGrid | null>(null)
    const updatingRef = useRef(false)
    const historyRef = useRef<{ cells: UserCell[]; solved: boolean }[]>([])
    const [canUndo, setCanUndo] = useState(false)

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

    function commitHistory() {
        historyRef.current.push({ cells: cellsRef.current.slice(), solved: solvedRef.current })
        if (historyRef.current.length > 200) historyRef.current.shift()
        setCanUndo(true)
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
        const hist = historyRef.current
        if (!hist.length) return
        const prev = hist.pop()!
        restore(prev.cells, prev.solved)
        setCanUndo(hist.length > 0)
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
                commitHistory()
                checkCompletion()
                cellsRef.current = readCells()
                updateViolations()
                handlers.current.onEdit()
            },
        })
        gridRef.current = grid
        historyRef.current = []
        setCanUndo(false)
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

    return { containerRef, canUndo, undo, reset }
}

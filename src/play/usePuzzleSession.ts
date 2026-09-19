import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { SharedPuzzle, UserCell, YinYangPuzzleDefinition } from '../puzzle/types'
import { dailyDate, seedFromDateString } from '../puzzle/seed'
import { range } from '../puzzle/grid'
import type { GenResponse } from '../puzzle/messages'
import {
    loadDay,
    saveDay,
    loadShared,
    saveShared,
    getSolvedDates,
    emptyUserCells,
    type DayRecord,
} from '../storage'
import { useGeneratorWorker } from './useGeneratorWorker'
import type { PuzzleHistory } from './usePuzzleBoard'

export const SIZES = range(4, 12) // 4x4 .. 12x12
export const DEFAULT_SIZE = 6

const SAVE_DEBOUNCE_MS = 250

/**
 * Key identifying a puzzle in the undo/redo store. It includes a fingerprint of
 * the givens because regenerating a day can produce a different puzzle for the
 * same date, and a stack from the old board would restore cells that no longer
 * fit the new one.
 */
function historyKeyFor(
    puzzle: YinYangPuzzleDefinition,
    date: string,
    sharedEncoded: string | null,
): string {
    if (sharedEncoded) return `shared:${sharedEncoded}`
    const givens = puzzle.fixedWhites
        .map((row, r) => row.map((w, c) => (w ? 'w' : puzzle.fixedBlacks[r][c] ? 'b' : '.')).join(''))
        .join('')
    return `daily:${date}:${puzzle.size.width}:${givens}`
}

export interface PuzzleSession {
    size: number
    setSize: (n: number) => void
    date: string
    selectDate: (d: string) => void
    generating: boolean
    puzzle: YinYangPuzzleDefinition | null
    status: string
    setStatus: (s: string) => void
    completedSizes: number[]
    refreshCompletedSizes: () => void
    /** The player's open cells — shared with the board so edits persist. */
    cellsRef: MutableRefObject<UserCell[]>
    /** Whether the current board is solved — shared with the board. */
    solvedRef: MutableRefObject<boolean>
    /**
     * Undo/redo stacks for every puzzle visited this session, keyed by
     * `historyKey`. In-memory only, so they start empty on page load, but a puzzle
     * keeps its own stack while a different one is being played.
     */
    historyStore: MutableRefObject<Map<string, PuzzleHistory>>
    /** Identity of the puzzle on screen, or null while one is loading. */
    historyKey: string | null
    /** Persist now (daily or shared, whichever this puzzle belongs to). */
    saveNow: () => void
    /** Persist after a short debounce (used for every cell edit). */
    saveSoon: () => void
}

/**
 * Owns the puzzle lifecycle: which size/date is showing, generating (daily) or
 * adopting (shared) the puzzle, background prefetching, and progress storage.
 */
export function usePuzzleSession(shared: SharedPuzzle | null): PuzzleSession {
    const [size, setSize] = useState(shared ? shared.givens.size.width : DEFAULT_SIZE)
    const [date, setDate] = useState(dailyDate())
    const [generating, setGenerating] = useState(false)
    const [puzzle, setPuzzle] = useState<YinYangPuzzleDefinition | null>(null)
    const [status, setStatus] = useState('')
    const [completedSizes, setCompletedSizes] = useState<number[]>([])

    const sizeRef = useRef(size)
    const dateRef = useRef(date)
    const puzzleRef = useRef<YinYangPuzzleDefinition | null>(null)
    const cellsRef = useRef<UserCell[]>([])
    const solvedRef = useRef(false)
    const historyStore = useRef<Map<string, PuzzleHistory>>(new Map())
    const saveTimerRef = useRef<number | null>(null)
    const sharedRef = useRef<SharedPuzzle | null>(shared ?? null)
    const encodedRef = useRef<string>(shared?.encoded ?? '')
    const requestIdRef = useRef(0)
    const prefetchIdRef = useRef(0)

    useEffect(() => {
        sizeRef.current = size
    }, [size])

    useEffect(() => {
        puzzleRef.current = puzzle
    }, [puzzle])

    // --- progress storage ---------------------------------------------------
    function currentRecord(): DayRecord | null {
        const pz = puzzleRef.current
        if (!pz) return null
        return {
            puzzle: pz,
            userCells: cellsRef.current,
            solved: solvedRef.current,
            solvedAt: solvedRef.current ? Date.now() : undefined,
        }
    }

    function persist(record: DayRecord) {
        if (sharedRef.current) saveShared(localStorage, encodedRef.current, record)
        else saveDay(localStorage, record.puzzle.size.width, dateRef.current, record)
    }

    function saveNow() {
        const record = currentRecord()
        if (record) persist(record)
    }

    function saveSoon() {
        if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = window.setTimeout(() => {
            saveTimerRef.current = null
            saveNow()
        }, SAVE_DEBOUNCE_MS)
    }

    function refreshCompletedSizes() {
        if (sharedRef.current) {
            setCompletedSizes([])
            return
        }
        const d = dateRef.current
        setCompletedSizes(
            SIZES.filter(
                (s) =>
                    getSolvedDates(localStorage, s).includes(d) ||
                    // The puzzle on screen may not have been persisted yet.
                    (s === sizeRef.current && solvedRef.current),
            ),
        )
    }

    // --- loading ------------------------------------------------------------
    function loadDaily(d: string) {
        dateRef.current = d
        setDate(d)
        const n = sizeRef.current
        const record = loadDay(localStorage, n, d)
        if (record && record.puzzle && record.puzzle.size.width === n) {
            cellsRef.current = record.userCells
            solvedRef.current = record.solved
            setGenerating(false)
            setPuzzle(record.puzzle)
            setStatus(record.solved ? 'Solved!' : '')
            return
        }
        cellsRef.current = emptyUserCells(n * n)
        solvedRef.current = false
        const id = ++requestIdRef.current
        setGenerating(true)
        setStatus('Loading puzzle…')
        post({ id, size: { width: n, height: n }, seed: seedFromDateString(d) })
    }

    function adoptShared() {
        const sh = sharedRef.current
        if (!sh) return
        const givens = sh.givens
        const n = givens.size.width
        const record = loadShared(localStorage, encodedRef.current)
        if (record && record.puzzle && record.puzzle.size.width === n) {
            cellsRef.current = record.userCells
            solvedRef.current = record.solved
            setGenerating(false)
            setPuzzle(record.puzzle)
            setStatus(record.solved ? 'Solved!' : '')
            return
        }
        // A share link is a unique puzzle by construction, so there's no need to
        // solve for a recorded `solution` — completion is validated by the rules
        // alone. (The cast is safe: nothing reads `puzzle.solution` at runtime.)
        setPuzzle({
            size: givens.size,
            fixedWhites: givens.fixedWhites,
            fixedBlacks: givens.fixedBlacks,
        } as YinYangPuzzleDefinition)
        cellsRef.current = emptyUserCells(n * n)
        solvedRef.current = false
        setGenerating(false)
        setStatus('')
    }

    /** Changing dates always starts at the smallest (4×4) puzzle. */
    function selectDate(d: string) {
        if (sizeRef.current === DEFAULT_SIZE) {
            loadDaily(d)
        } else {
            // Reset to 4×4; the [size] effect reloads for the new date.
            sizeRef.current = DEFAULT_SIZE
            setSize(DEFAULT_SIZE)
            dateRef.current = d
            setDate(d)
        }
    }

    /** Silently pre-generate the next-size daily puzzle in the background. */
    function prefetchNext() {
        const next = sizeRef.current + 1
        if (next > SIZES[SIZES.length - 1]) return
        const d = dateRef.current
        if (loadDay(localStorage, next, d)) return // already cached
        post({
            id: ++prefetchIdRef.current,
            size: { width: next, height: next },
            seed: seedFromDateString(d),
            date: d,
            prefetch: true,
        })
    }

    const post = useGeneratorWorker((message: GenResponse) => {
        if (message.prefetch) {
            // Cache a background pre-generation silently.
            const n = message.puzzle.size.width
            saveDay(localStorage, n, message.date ?? dateRef.current, {
                puzzle: message.puzzle,
                userCells: emptyUserCells(n * n),
                solved: false,
            })
            return
        }
        if (message.id !== requestIdRef.current) return // ignore stale results
        const pz = message.puzzle
        setGenerating(false)
        setPuzzle(pz)
        solvedRef.current = false
        setStatus('')
        cellsRef.current = emptyUserCells(pz.size.width * pz.size.width)
        persist({ puzzle: pz, userCells: cellsRef.current, solved: false })
    })

    // Load a puzzle on mount and whenever the size changes.
    useEffect(() => {
        if (sharedRef.current) adoptShared()
        else loadDaily(dateRef.current)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [size])

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
            saveNow()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Identity of the puzzle on screen. Only meaningful once the loaded puzzle
    // matches the selected size: while one generates, `puzzle` is still the
    // previous puzzle and its key would adopt a stack belonging to another board.
    const historyKey =
        puzzle && puzzle.size.width === size
            ? historyKeyFor(puzzle, date, sharedRef.current ? encodedRef.current : null)
            : null

    return {
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
    }
}

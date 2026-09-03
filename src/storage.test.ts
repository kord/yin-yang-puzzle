import { describe, expect, it } from 'vitest'
import {
    getSolvedDates,
    loadDay,
    saveDay,
    type DayRecord,
    type StorageLike,
} from './storage'
import type { UserCell, YinYangPuzzleDefinition } from './puzzle/types'

function memoryStorage(): StorageLike & { data: Map<string, string> } {
    const data = new Map<string, string>()
    return {
        data,
        getItem(key: string) {
            return data.get(key) ?? null
        },
        setItem(key: string, value: string) {
            data.set(key, value)
        },
    }
}

const puzzle: YinYangPuzzleDefinition = {
    size: { width: 2, height: 2 },
    fixedWhites: [
        [true, false],
        [false, true],
    ],
    fixedBlacks: [
        [false, true],
        [true, false],
    ],
    solution: {
        size: { width: 2, height: 2 },
        isWhite: [
            [true, false],
            [false, true],
        ],
    },
}

const userCells: UserCell[] = ['.', 'b', 'w', '.']

describe('storage', () => {
    it('round-trips a day record', () => {
        const store = memoryStorage()
        const record: DayRecord = { puzzle, userCells, solved: false }
        saveDay(store, 6, '2026-08-29', record)
        expect(loadDay(store, 6, '2026-08-29')).toEqual(record)
    })

    it('keeps records for different sizes separate', () => {
        const store = memoryStorage()
        const record: DayRecord = { puzzle, userCells, solved: false }
        saveDay(store, 6, '2026-08-29', record)
        expect(loadDay(store, 7, '2026-08-29')).toBeNull()
        expect(loadDay(store, 6, '2026-08-29')).toEqual(record)
    })

    it('tracks solved dates per size', () => {
        const store = memoryStorage()
        saveDay(store, 6, '2026-08-29', { puzzle, userCells, solved: true })
        saveDay(store, 6, '2026-08-30', { puzzle, userCells, solved: true })
        saveDay(store, 7, '2026-08-29', { puzzle, userCells, solved: true })
        expect(getSolvedDates(store, 6)).toEqual(['2026-08-29', '2026-08-30'])
        expect(getSolvedDates(store, 7)).toEqual(['2026-08-29'])
    })

    it('returns null for an unknown date', () => {
        const store = memoryStorage()
        expect(loadDay(store, 6, '2026-08-29')).toBeNull()
    })

    it('ignores records with an older schema version', () => {
        const store = memoryStorage()
        store.setItem(
            'yinyang.day.6.2026-08-29',
            JSON.stringify({ version: 1, puzzle, userCells, solved: false }),
        )
        expect(loadDay(store, 6, '2026-08-29')).toBeNull()
    })
})

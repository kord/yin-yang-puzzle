// localStorage persistence for daily puzzles: the generated puzzle and
// solution, the player's current markings, and the solved flag.

import type { UserCell, YinYangPuzzleDefinition } from "./puzzle/types";


const PUZZLENAME = 'yinyang';

export interface DayRecord {
    puzzle: YinYangPuzzleDefinition
    userCells: UserCell[]
    solved: boolean
    solvedAt?: number
}

export interface StorageLike {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
}

const dayKey = (size: number, date: string): string => `${PUZZLENAME}.day.${size}.${date}`
const solvedKey = (size: number): string => `${PUZZLENAME}.solved.${size}`
const SCHEMA_VERSION = 2

const encodeRecord = (record: DayRecord): string => JSON.stringify({ ...record, version: SCHEMA_VERSION })

function decodeRecord(raw: string | null): DayRecord | null {
    if (!raw) return null
    try {
        const parsed = JSON.parse(raw) as { version?: number } & DayRecord
        if (parsed.version !== SCHEMA_VERSION) return null
        const { version: _version, ...record } = parsed
        if (!record || !Array.isArray(record.userCells)) return null
        return record
    } catch {
        return null
    }
}

export function loadDay(storage: StorageLike, size: number, date: string): DayRecord | null {
    return decodeRecord(storage.getItem(dayKey(size, date)))
}

export function saveDay(storage: StorageLike, size: number, date: string, record: DayRecord): void {
    storage.setItem(dayKey(size, date), encodeRecord(record))

    if (record.solved) {
        const solved = getSolvedDates(storage, size)
        if (!solved.includes(date)) {
            solved.push(date)
            storage.setItem(solvedKey(size), JSON.stringify(solved))
        }
    }
}

export function getSolvedDates(storage: StorageLike, size: number): string[] {
    const raw = storage.getItem(solvedKey(size))
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? (parsed as string[]) : []
    } catch {
        return []
    }
}

export function emptyUserCells(n: number): UserCell[] {
    return new Array<UserCell>(n).fill('.')
}

// Shared-puzzle progress, keyed by the encoded `?p=` string so it never
// collides with (or leaks into) the daily-puzzle storage.
const sharedKey = (encoded: string): string => `${PUZZLENAME}.shared.${encoded}`

export function loadShared(storage: StorageLike, encoded: string): DayRecord | null {
    return decodeRecord(storage.getItem(sharedKey(encoded)))
}

export function saveShared(storage: StorageLike, encoded: string, record: DayRecord): void {
    storage.setItem(sharedKey(encoded), encodeRecord(record))
}

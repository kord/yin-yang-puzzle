import { useEffect, useRef, useState } from 'react'
import { formatDate } from './puzzle/seed'
import './MonthPicker.css'

interface MonthPickerProps {
    value: string
    max?: string
    disabled?: boolean
    onSelect: (date: string) => void
    isCompleted?: (date: string) => boolean
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function toDate(str: string): Date {
    const [y, m, d] = str.split('-').map(Number)
    return new Date(y, m - 1, d)
}

/**
 * A month-at-a-time date picker exposed as a dropdown from a calendar icon.
 * The date is chosen only by clicking a day (no free-text entry); prev/next
 * buttons move one month at a time. Clicking outside closes the dropdown.
 */
export default function MonthPicker({ value, max, disabled, onSelect, isCompleted }: MonthPickerProps) {
    const selected = toDate(value)
    const maxDate = max ? toDate(max) : null
    const [open, setOpen] = useState(false)
    const [view, setView] = useState({ year: selected.getFullYear(), month: selected.getMonth() })
    const rootRef = useRef<HTMLDivElement | null>(null)

    // Close if the picker becomes disabled (e.g. during generation).
    useEffect(() => {
        if (disabled) setOpen(false)
    }, [disabled])

    // Close on click outside.
    useEffect(() => {
        if (!open) return
        const onDocClick = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onDocClick)
        return () => document.removeEventListener('mousedown', onDocClick)
    }, [open])

    const toggle = () => {
        if (disabled) return
        if (!open) {
            const s = toDate(value)
            setView({ year: s.getFullYear(), month: s.getMonth() })
        }
        setOpen((o) => !o)
    }

    const pick = (dateStr: string) => {
        setOpen(false)
        onSelect(dateStr)
    }

    const first = new Date(view.year, view.month, 1)
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
    const firstWeekday = first.getDay()

    const canNext = maxDate
        ? view.year < maxDate.getFullYear() ||
        (view.year === maxDate.getFullYear() && view.month < maxDate.getMonth())
        : true

    const prev = () =>
        setView(({ year, month }) => (month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }))
    const next = () =>
        setView(({ year, month }) => (month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }))

    const label = `${first.toLocaleString('en-US', { month: 'long' })} ${view.year}`

    const cells: (string | null)[] = []
    for (let i = 0; i < firstWeekday; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(formatDate(new Date(view.year, view.month, d)))

    return (
        <div className="month-picker" ref={rootRef}>
            <button
                type="button"
                className="month-picker__trigger"
                onClick={toggle}
                disabled={disabled}
                aria-expanded={open}
            >
                <span className="month-picker__value">{value}</span>
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <line x1="8" y1="3" x2="8" y2="7" />
                    <line x1="16" y1="3" x2="16" y2="7" />
                </svg>
            </button>

            {open && (
                <div className="month-picker__dropdown">
                    <div className="month-picker__header">
                        <button
                            type="button"
                            className="month-picker__nav"
                            onClick={prev}
                            disabled={disabled}
                            aria-label="Previous month"
                        >
                            ‹
                        </button>
                        <span className="month-picker__label">{label}</span>
                        <button
                            type="button"
                            className="month-picker__nav"
                            onClick={next}
                            disabled={disabled || !canNext}
                            aria-label="Next month"
                        >
                            ›
                        </button>
                    </div>

                    <div className="month-picker__grid">
                        {WEEKDAYS.map((w, i) => (
                            <div key={`w${i}`} className="month-picker__weekday">
                                {w}
                            </div>
                        ))}
                        {cells.map((dateStr, i) => {
                            if (!dateStr) return <div key={i} className="month-picker__cell month-picker__cell--empty" />
                            const isSelected = dateStr === value
                            const isToday = dateStr === max
                            const completed = isCompleted ? isCompleted(dateStr) : false
                            const future = max && maxDate ? dateStr > max : false
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    className={`month-picker__cell${isSelected ? ' month-picker__cell--selected' : ''}${completed ? ' month-picker__cell--completed' : ''}${isToday ? ' month-picker__cell--today' : ''}`}
                                    disabled={disabled || future}
                                    onClick={() => pick(dateStr)}
                                >
                                    {Number(dateStr.slice(-2))}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}


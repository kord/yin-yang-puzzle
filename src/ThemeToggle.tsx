import { useEffect, useState } from 'react'
import { applyTheme, getStoredTheme, preferredTheme, setStoredTheme, type Theme } from './theme'
import './ThemeToggle.css'

const SUN = (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
    >
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </svg>
)

const MOON = (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
)

/**
 * Floating theme switch in the top-right corner. Starts from the stored choice,
 * or the OS setting, and keeps following the OS for as long as the user has not
 * made an explicit choice.
 */
export default function ThemeToggle() {
    const [theme, setTheme] = useState<Theme>(() => getStoredTheme() ?? preferredTheme())

    useEffect(() => {
        if (getStoredTheme()) return // an explicit choice wins; stop following the OS
        const query = window.matchMedia('(prefers-color-scheme: light)')
        const onChange = () => {
            const next = preferredTheme()
            setTheme(next)
            applyTheme(next)
        }
        query.addEventListener('change', onChange)
        return () => query.removeEventListener('change', onChange)
    }, [])

    const toggle = () => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark'
        setTheme(next)
        setStoredTheme(next)
        applyTheme(next)
    }

    // The icon shows the theme you would switch *to*, matching the label.
    const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

    return (
        <button type="button" className="theme-toggle" onClick={toggle} title={label} aria-label={label}>
            {theme === 'dark' ? SUN : MOON}
        </button>
    )
}

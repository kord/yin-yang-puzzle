export type Theme = 'light' | 'dark'

/**
 * Kept in sync by hand with the bootstrap script in `index.html`, which runs
 * before first paint and cannot import this module.
 */
const STORAGE_KEY = 'yinyang.theme'

/** The theme the user explicitly picked, or `null` if they never have. */
export function getStoredTheme(): Theme | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw === 'light' || raw === 'dark' ? raw : null
    } catch {
        return null // storage disabled (private mode, blocked cookies)
    }
}

export function setStoredTheme(theme: Theme): void {
    try {
        localStorage.setItem(STORAGE_KEY, theme)
    } catch {
        // Nothing to do; the theme still applies for this session.
    }
}

/** What the OS asks for. */
export function preferredTheme(): Theme {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(theme: Theme): void {
    document.documentElement.dataset.theme = theme
}

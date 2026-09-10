/**
 * The Yin-Yang validity rules, on a plain boolean grid where `true` means white.
 * Shared by the player's completion check and the solver so they can't drift.
 */

/** True if any 2×2 block is a single colour (a Yin-Yang violation). */
export function hasMonochrome2x2(isWhite: readonly boolean[][]): boolean {
    const n = isWhite.length
    for (let r = 0; r < n - 1; r++) {
        for (let c = 0; c < n - 1; c++) {
            const a = isWhite[r][c]
            if (isWhite[r][c + 1] === a && isWhite[r + 1][c] === a && isWhite[r + 1][c + 1] === a) {
                return true
            }
        }
    }
    return false
}

/** The 4-connected components of one colour. */
export function connectedComponents(isWhite: readonly boolean[][], white: boolean): [number, number][][] {
    const n = isWhite.length
    const visited = Array.from({ length: n }, () => Array(n).fill(false))
    const comps: [number, number][][] = []
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (isWhite[r][c] !== white || visited[r][c]) continue
            const comp: [number, number][] = []
            const stack: [number, number][] = [[r, c]]
            visited[r][c] = true
            while (stack.length) {
                const [cr, cc] = stack.pop()!
                comp.push([cr, cc])
                for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nr = cr + dr, nc = cc + dc
                    if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue
                    if (visited[nr][nc] || isWhite[nr][nc] !== white) continue
                    visited[nr][nc] = true
                    stack.push([nr, nc])
                }
            }
            comps.push(comp)
        }
    }
    return comps
}

/** True if all cells of one colour (white when `white`, else black) form a single connected group. */
export function isColorConnected(isWhite: readonly boolean[][], white: boolean): boolean {
    return connectedComponents(isWhite, white).length <= 1
}

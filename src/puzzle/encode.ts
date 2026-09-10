/**
 * Obfuscated, URL-safe encoding of a puzzle definition for a `p=` query param.
 *
 * Two formats, and `encodePuzzle` returns whichever is shorter:
 *   - DENSE  (version 1): 2 bits per cell over the whole board (00 empty, 01 W, 10 B).
 *   - SPARSE (version 2): the number of givens, then each given's cell index + colour.
 *
 * Both start with [version, width, height], then a bit-packed body.
 *
 * The whole byte stream is then XOR-masked with a content-derived keystream
 * (a light obfuscation, not cryptography) before base-63 encoding, so the
 * structural metadata (version / format, board size, hint count) is not
 * readable from the leading characters. Because the keystream is keyed by a
 * hash of the whole stream (the 8-byte seed is stored at the front), even two
 * puzzles with the same hint count produce totally unrelated strings.
 *
 * The base-63 codec is a bijection on byte arrays (it pins the length with a
 * marker bit) so leading zero bytes produced by the mask survive the trip.
 *
 * Base 63 uses the RFC-4648 URL-safe alphabet minus `-` (A–Z a–z 0–9 `_`),
 * so the output is safe in `?p=`.
 */

import type { YinYangPuzzlePartialDefinition } from './types'
import { blank } from './grid'

/** The puzzle shape this module encodes — the same fields as a partial definition. */
export type PuzzleEncodingInput = YinYangPuzzlePartialDefinition

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_'

function toBase63(bytes: number[]): string {
    if (bytes.length === 0) return ''
    let num = 0n
    for (const b of bytes) num = (num << 8n) | BigInt(b)
    // Set a marker bit just above the byte stream so the encoding is a
    // bijection on byte arrays: the marker pins the length, so leading zero
    // bytes (which can appear after masking) survive the round trip.
    num = (1n << BigInt(8 * bytes.length)) | num
    let out = ''
    while (num > 0n) {
        out = ALPHABET[Number(num % 63n)] + out
        num /= 63n
    }
    return out
}

function fromBase63(encoded: string): number[] {
    if (encoded.length === 0) return []
    const indexOf = new Map<string, number>()
    for (let i = 0; i < ALPHABET.length; i++) indexOf.set(ALPHABET[i], i)
    let num = 0n
    for (const ch of encoded) {
        const d = indexOf.get(ch)
        if (d === undefined) return []
        num = num * 63n + BigInt(d)
    }
    if (num === 0n) return []
    // Recover length from the marker bit set in toBase63.
    const lenBytes = (num.toString(2).length - 1) >> 3
    let value = num & ((1n << BigInt(8 * lenBytes)) - 1n)
    const bytes: number[] = []
    for (let i = 0; i < lenBytes; i++) {
        bytes.unshift(Number(value & 0xffn))
        value >>= 8n
    }
    return bytes
}

// ---------------------------------------------------------------------------
// Light obfuscation — a content-derived mask.
//
// A fixed keystream would preserve equal prefixes (two puzzles with the same
// hint count would share a leading run), so instead we key the keystream by a
// hash of the *whole* byte stream and store that 8-byte seed at the front
// (unmasked). Because the seed depends on the entire content, puzzles that
// share a structural prefix produce completely different encodings — no leading
// cluster, no readable hint count. The seed itself looks random, so it reveals
// nothing by casual inspection.
// ---------------------------------------------------------------------------
const SEED_BYTES = 8

function hashBytes(bytes: number[]): number[] {
    // Two independent 32-bit FNV-1a passes -> 8-byte seed.
    let h1 = 0x811c9dc5
    let h2 = 0x9e3779b9
    for (const b of bytes) {
        h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0
        h2 = Math.imul(h2 ^ ((b + 0x9e3779b9) & 0xff), 0x01000193) >>> 0
    }
    const out: number[] = []
    for (let i = 3; i >= 0; i--) out.push((h1 >>> (i * 8)) & 0xff)
    for (let i = 3; i >= 0; i--) out.push((h2 >>> (i * 8)) & 0xff)
    return out
}

function keystream(seed: number[], length: number): number[] {
    let a = ((seed[0] << 24) | (seed[1] << 16) | (seed[2] << 8) | seed[3]) >>> 0
    let b = ((seed[4] << 24) | (seed[5] << 16) | (seed[6] << 8) | seed[7]) >>> 0
    const out: number[] = []
    for (let i = 0; i < length; i++) {
        a ^= a << 13
        a >>>= 0
        a ^= a >>> 17
        a ^= a << 5
        a >>>= 0
        b = (b + 0x9e3779b9) >>> 0
        out.push((a ^ b) & 0xff)
    }
    return out
}

function maskBytes(bytes: number[]): { seed: number[]; masked: number[] } {
    const seed = hashBytes(bytes)
    const ks = keystream(seed, bytes.length)
    return { seed, masked: bytes.map((b, i) => b ^ ks[i]) }
}

function unmaskBytes(seed: number[], masked: number[]): number[] {
    const ks = keystream(seed, masked.length)
    return masked.map((b, i) => b ^ ks[i])
}

function encodeOne(raw: number[]): string {
    const { seed, masked } = maskBytes(raw)
    return toBase63([...seed, ...masked])
}

// ---------------------------------------------------------------------------
// DENSE (whole board)
// ---------------------------------------------------------------------------
function encodeDenseRaw(p: PuzzleEncodingInput): number[] {
    const n = p.size.width
    const bytes: number[] = [1, n, p.size.height]
    let acc = 0
    let bits = 0
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            let code = 0
            if (p.fixedWhites[r][c]) code = 1
            else if (p.fixedBlacks[r][c]) code = 2
            acc = (acc << 2) | code
            bits += 2
            if (bits === 8) {
                bytes.push(acc)
                acc = 0
                bits = 0
            }
        }
    }
    if (bits > 0) bytes.push(acc << (8 - bits))
    return bytes
}

function decodeDense(bytes: number[]): PuzzleEncodingInput | null {
    if (bytes.length < 3 || bytes[0] !== 1) return null
    const n = bytes[1]
    const height = bytes[2]
    const fixedWhites = blank(n)
    const fixedBlacks = blank(n)
    let bit = 0
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const byteIdx = 3 + (bit >> 3)
            if (byteIdx >= bytes.length) return null
            const shift = 6 - (bit & 7)
            const code = (bytes[byteIdx] >> shift) & 0b11
            if (code === 1) fixedWhites[r][c] = true
            else if (code === 2) fixedBlacks[r][c] = true
            else if (code !== 0) return null
            bit += 2
        }
    }
    return { size: { width: n, height }, fixedWhites, fixedBlacks }
}

// ---------------------------------------------------------------------------
// SPARSE (explicit hint locations)
// ---------------------------------------------------------------------------
function encodeSparseRaw(p: PuzzleEncodingInput): number[] {
    const n = p.size.width
    const total = n * n
    const cellBits = Math.max(1, Math.ceil(Math.log2(total)))
    const kBits = Math.max(1, Math.ceil(Math.log2(total + 1)))

    const givens: { idx: number; black: boolean }[] = []
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (p.fixedWhites[r][c]) givens.push({ idx: r * n + c, black: false })
            else if (p.fixedBlacks[r][c]) givens.push({ idx: r * n + c, black: true })
        }
    }

    const bytes: number[] = [2, n, p.size.height]
    let acc = 0
    let bits = 0
    const write = (value: number, nbits: number) => {
        for (let i = nbits - 1; i >= 0; i--) {
            acc = (acc << 1) | ((value >> i) & 1)
            bits++
            if (bits === 8) {
                bytes.push(acc)
                acc = 0
                bits = 0
            }
        }
    }

    write(givens.length, kBits)
    for (const g of givens) {
        write(g.idx, cellBits)
        write(g.black ? 1 : 0, 1)
    }
    if (bits > 0) bytes.push(acc << (8 - bits))
    return bytes
}

function decodeSparse(bytes: number[]): PuzzleEncodingInput | null {
    if (bytes.length < 3 || bytes[0] !== 2) return null
    const n = bytes[1]
    const height = bytes[2]
    const total = n * n
    const cellBits = Math.max(1, Math.ceil(Math.log2(total)))
    const kBits = Math.max(1, Math.ceil(Math.log2(total + 1)))

    let pos = 24 // 3 header bytes
    const read = (nbits: number): number => {
        let val = 0
        for (let i = 0; i < nbits; i++) {
            const byteIdx = pos >> 3
            if (byteIdx >= bytes.length) return -1
            const shift = 7 - (pos & 7)
            val = (val << 1) | ((bytes[byteIdx] >> shift) & 1)
            pos++
        }
        return val
    }

    const k = read(kBits)
    if (k < 0 || k > total) return null
    const fixedWhites = blank(n)
    const fixedBlacks = blank(n)
    const seen = new Set<number>()
    for (let i = 0; i < k; i++) {
        const idx = read(cellBits)
        const black = read(1)
        if (idx < 0 || black < 0 || idx >= total || seen.has(idx)) return null
        seen.add(idx)
        const r = Math.floor(idx / n)
        const c = idx % n
        if (black === 1) fixedBlacks[r][c] = true
        else fixedWhites[r][c] = true
    }
    return { size: { width: n, height }, fixedWhites, fixedBlacks }
}

// ---------------------------------------------------------------------------
// Public API — pick the shorter representation.
// ---------------------------------------------------------------------------
export function encodePuzzle(puzzle: PuzzleEncodingInput): string {
    const dense = encodeOne(encodeDenseRaw(puzzle))
    const sparse = encodeOne(encodeSparseRaw(puzzle))
    return dense.length <= sparse.length ? dense : sparse
}

export function decodePuzzle(encoded: string): PuzzleEncodingInput | null {
    const bytes = fromBase63(encoded)
    if (bytes.length < SEED_BYTES + 3) return null
    const raw = unmaskBytes(bytes.slice(0, SEED_BYTES), bytes.slice(SEED_BYTES))
    if (raw.length < 3) return null
    if (raw[0] === 1) return decodeDense(raw)
    if (raw[0] === 2) return decodeSparse(raw)
    return null
}

/**
 * PuzzleGrid
 *
 * A framework-agnostic utility that renders a puzzle grid as SVG and lets the
 * user click-drag across squares, edges and vertices to paint their state.
 *
 * Each element is one of three kinds:
 *   - square  : an R x C cell
 *   - edge    : a horizontal or vertical segment between two vertices
 *   - vertex  : a grid intersection point
 *
 * Every element carries a `data-state` attribute so its appearance can be
 * styled entirely via CSS. The grid exposes a small state API for reading and
 * writing states (e.g. to mark elements as `fixed` by the puzzle definition),
 * and a configurable painting model for user interaction.
 *
 * Pure TypeScript — no React dependency. Mount into any HTMLElement:
 *
 *   const grid = new PuzzleGrid({ rows: 5, cols: 5 })
 *   grid.mount(document.querySelector('#app'))
 */

import './PuzzleGrid.css'

export type ElementKind = 'square' | 'edge' | 'vertex'
export type ElementState = 'untouched' | 'x' | 'fixed' | 'activated' | 'inactivated'
export type EdgeOrientation = 'horizontal' | 'vertical'

export interface ElementRef {
    kind: ElementKind
    row: number
    col: number
    /** Only present for edges. */
    orientation?: EdgeOrientation
}

export interface PuzzleGridOptions {
    rows: number
    cols: number
    /** Size of a cell in SVG user units. Default 64. */
    cellSize?: number
    /** Gap around each square tile. Default 0 (squares are flush with grid lines). */
    innerGap?: number
    /** Per-kind default state when no state has been assigned. Default `untouched`. */
    defaultState?: Partial<Record<ElementKind, ElementState>>
    /** Per-kind order in which painting cycles through states. */
    paintCycle?: Partial<Record<ElementKind, ElementState[]>>
    /** Per-kind flag that locks an entire kind against painting. */
    immutable?: Partial<Record<ElementKind, boolean>>
    /**
     * Which element kinds are rendered and interactive. Omitted kinds default to
     * `true`. Set a kind to `false` to hide it entirely (e.g. a cell-only puzzle).
     */
    kinds?: Partial<Record<ElementKind, boolean>>
    /** Called whenever an element's state changes. */
    onStateChange?: (ref: ElementRef, state: ElementState) => void
}

const DEFAULT_STATE: ElementState = 'untouched'
const DEFAULT_CYCLE: ElementState[] = ['activated', 'inactivated', 'x', 'untouched']

const SVG_NS = 'http://www.w3.org/2000/svg'

export class PuzzleGrid {
    private readonly rows: number
    private readonly cols: number
    private readonly cellSize: number
    private readonly innerGap: number
    private readonly defaultState: Record<ElementKind, ElementState>
    private readonly paintCycle: Record<ElementKind, ElementState[]>
    private readonly immutableMap: Record<ElementKind, boolean>
    private readonly visibleKinds: Record<ElementKind, boolean>
    private readonly onStateChange?: (ref: ElementRef, state: ElementState) => void

    private readonly states = new Map<string, ElementState>()
    private readonly readonlyCells = new Set<string>()
    private readonly elements = new Map<string, SVGGElement>()
    private readonly xOverlays = new Map<string, SVGGElement>()

    private svg: SVGSVGElement | null = null

    private painting = false
    private paintState: ElementState = 'untouched'
    private lastPaintedId: string | null = null

    constructor(options: PuzzleGridOptions) {
        this.rows = options.rows
        this.cols = options.cols
        this.cellSize = options.cellSize ?? 64
        this.innerGap = options.innerGap ?? 0
        this.defaultState = {
            square: options.defaultState?.square ?? DEFAULT_STATE,
            edge: options.defaultState?.edge ?? DEFAULT_STATE,
            vertex: options.defaultState?.vertex ?? DEFAULT_STATE,
        }
        this.paintCycle = {
            square: options.paintCycle?.square ?? DEFAULT_CYCLE,
            edge: options.paintCycle?.edge ?? DEFAULT_CYCLE,
            vertex: options.paintCycle?.vertex ?? DEFAULT_CYCLE,
        }
        this.immutableMap = {
            square: options.immutable?.square ?? false,
            edge: options.immutable?.edge ?? false,
            vertex: options.immutable?.vertex ?? false,
        }
        this.visibleKinds = {
            square: options.kinds?.square ?? true,
            edge: options.kinds?.edge ?? true,
            vertex: options.kinds?.vertex ?? true,
        }
        this.onStateChange = options.onStateChange
    }

    // -------------------------------------------------------------------------
    // Geometry
    // -------------------------------------------------------------------------

    private get pad(): number {
        return this.cellSize / 2
    }

    private get width(): number {
        return this.pad * 2 + this.cellSize * this.cols
    }

    private get height(): number {
        return this.pad * 2 + this.cellSize * this.rows
    }

    private get vertexRadius(): number {
        return Math.max(4, this.cellSize / 12)
    }

    // -------------------------------------------------------------------------
    // State API
    // -------------------------------------------------------------------------

    private elementId(ref: ElementRef): string {
        if (ref.kind === 'edge') {
            const o = ref.orientation === 'vertical' ? 'v' : 'h'
            return `edge-${o}:${ref.row}:${ref.col}`
        }
        return `${ref.kind}:${ref.row}:${ref.col}`
    }

    getState(ref: ElementRef): ElementState {
        return this.states.get(this.elementId(ref)) ?? this.defaultState[ref.kind]
    }

    setState(ref: ElementRef, state: ElementState): void {
        const id = this.elementId(ref)
        this.states.set(id, state)
        this.updateElement(id, state)
        this.onStateChange?.(ref, state)
    }

    /** Lock an element so painting cannot change it (used for given/clue cells). */
    setReadonly(ref: ElementRef, readonly = true): void {
        const id = this.elementId(ref)
        if (readonly) this.readonlyCells.add(id)
        else this.readonlyCells.delete(id)
        this.updateElement(id, this.getState(ref))
    }

    getReadonly(ref: ElementRef): boolean {
        return this.readonlyCells.has(this.elementId(ref))
    }

    /** Reset every element back to its kind's default state. */
    reset(): void {
        const ids = [...this.states.keys()]
        for (const id of ids) {
            this.states.delete(id)
            this.updateElement(id, this.defaultStateForId(id))
        }
        this.onReset?.()
    }

    /** Optional hook fired after reset(). */
    onReset?: () => void

    private defaultStateForId(id: string): ElementState {
        if (id.startsWith('square')) return this.defaultState.square
        if (id.startsWith('edge')) return this.defaultState.edge
        return this.defaultState.vertex
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    mount(container: HTMLElement): void {
        this.destroy()

        const svg = document.createElementNS(SVG_NS, 'svg')
        svg.setAttribute('class', 'puzzle-grid')
        svg.setAttribute('width', String(this.width))
        svg.setAttribute('height', String(this.height))
        svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`)
        svg.setAttribute('role', 'grid')

        this.svg = svg
        this.elements.clear()
        this.xOverlays.clear()

        if (this.visibleKinds.square) {
            this.appendStoneDefs(svg)
            const squares = this.createLayer('puzzle-grid__squares')
            this.buildSquares(squares)
            svg.appendChild(squares)
        }
        if (this.visibleKinds.edge) {
            const edges = this.createLayer('puzzle-grid__edges')
            this.buildEdges(edges)
            svg.appendChild(edges)
        }
        if (this.visibleKinds.vertex) {
            const vertices = this.createLayer('puzzle-grid__vertices')
            this.buildVertices(vertices)
            svg.appendChild(vertices)
        }

        container.appendChild(svg)

        svg.addEventListener('pointerdown', this.onPointerDown)
        svg.addEventListener('contextmenu', this.onContextMenu)
        window.addEventListener('pointermove', this.onPointerMove)
        window.addEventListener('pointerup', this.onPointerUp)
    }

    destroy(): void {
        if (this.svg) {
            this.svg.removeEventListener('pointerdown', this.onPointerDown)
            this.svg.removeEventListener('contextmenu', this.onContextMenu)
            this.svg.remove()
            this.svg = null
        }
        window.removeEventListener('pointermove', this.onPointerMove)
        window.removeEventListener('pointerup', this.onPointerUp)
        this.painting = false
        this.lastPaintedId = null
    }

    // -------------------------------------------------------------------------
    // SVG construction
    // -------------------------------------------------------------------------

    private createLayer(className: string): SVGGElement {
        return this.createSvgEl('g', { class: className }) as SVGGElement
    }

    /** Add radial gradients that give the stones their glossy go-stone look. */
    private appendStoneDefs(svg: SVGSVGElement): void {
        const defs = this.createSvgEl('defs', {}) as SVGDefsElement
        defs.appendChild(this.createGradient('pg-black-stone', '#5a5a5a', '#000000'))
        defs.appendChild(this.createGradient('pg-white-stone', '#ffffff', '#e2e2e2'))
        svg.appendChild(defs)
    }

    private createGradient(id: string, from: string, to: string): SVGGradientElement {
        const gradient = this.createSvgEl('radialGradient', {
            id,
            cx: '35%',
            cy: '35%',
            r: '75%',
        }) as SVGGradientElement
        gradient.appendChild(this.createStop(from, '0%'))
        gradient.appendChild(this.createStop(to, '100%'))
        return gradient
    }

    private createStop(color: string, offset: string): SVGStopElement {
        return this.createSvgEl('stop', {
            'stop-color': color,
            offset,
        }) as SVGStopElement
    }

    private createSvgEl(tag: string, attrs: Record<string, string>): SVGElement {
        const el = document.createElementNS(SVG_NS, tag)
        for (const [key, value] of Object.entries(attrs)) {
            el.setAttribute(key, value)
        }
        return el
    }

    private createGroup(ref: ElementRef): SVGGElement {
        const kindClass = `puzzle-grid__${ref.kind}`
        const orientationClass =
            ref.kind === 'edge' ? ` puzzle-grid__edge--${ref.orientation ?? 'horizontal'}` : ''
        const g = this.createSvgEl('g', {
            class: `${kindClass}${orientationClass}`,
            'data-kind': ref.kind,
            'data-row': String(ref.row),
            'data-col': String(ref.col),
            'data-state': DEFAULT_STATE,
        }) as SVGGElement

        if (ref.kind === 'edge') {
            g.setAttribute('data-orientation', ref.orientation ?? 'horizontal')
        }
        return g
    }

    private buildSquares(layer: SVGGElement): void {
        const s = this.cellSize
        const gap = this.innerGap
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const ref: ElementRef = { kind: 'square', row: r, col: c }
                const x = this.pad + c * s + gap / 2
                const y = this.pad + r * s + gap / 2
                const w = s - gap
                const h = s - gap

                const g = this.createGroup(ref)

                // Cell background (board). Given cells get a gray backdrop via CSS.
                g.appendChild(this.createSvgEl('rect', {
                    class: 'puzzle-grid__cell-bg',
                    x: String(x),
                    y: String(y),
                    width: String(w),
                    height: String(h),
                }))

                // The stone, rendered as a glossy circle.
                const cx = x + w / 2
                const cy = y + h / 2
                const radius = Math.min(w, h) / 2 * 0.78
                g.appendChild(this.createSvgEl('circle', {
                    class: 'puzzle-grid__shape',
                    cx: String(cx),
                    cy: String(cy),
                    r: String(radius),
                }))
                g.appendChild(this.buildXOverlay(cx, cy, radius * 0.7))
                layer.appendChild(g)
                this.register(ref, g)
            }
        }
    }

    private buildEdges(layer: SVGGElement): void {
        const s = this.cellSize
        const hitWidth = Math.max(12, s * 0.3)

        // Horizontal edges: rows 0..rows, each with cols segments.
        for (let r = 0; r <= this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const ref: ElementRef = { kind: 'edge', row: r, col: c, orientation: 'horizontal' }
                const x1 = this.pad + c * s
                const y1 = this.pad + r * s
                const x2 = this.pad + (c + 1) * s
                const y2 = y1

                const g = this.createGroup(ref)
                g.appendChild(this.createSvgEl('line', {
                    class: 'puzzle-grid__shape',
                    x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2),
                }))
                g.appendChild(this.createSvgEl('line', {
                    class: 'puzzle-grid__hit-area',
                    x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2),
                    stroke: 'transparent',
                    'stroke-width': String(hitWidth),
                }))
                g.appendChild(this.buildXOverlay((x1 + x2) / 2, y1, s * 0.16))
                layer.appendChild(g)
                this.register(ref, g)
            }
        }

        // Vertical edges: columns 0..cols, each with rows segments.
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c <= this.cols; c++) {
                const ref: ElementRef = { kind: 'edge', row: r, col: c, orientation: 'vertical' }
                const x1 = this.pad + c * s
                const y1 = this.pad + r * s
                const x2 = x1
                const y2 = this.pad + (r + 1) * s

                const g = this.createGroup(ref)
                g.appendChild(this.createSvgEl('line', {
                    class: 'puzzle-grid__shape',
                    x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2),
                }))
                g.appendChild(this.createSvgEl('line', {
                    class: 'puzzle-grid__hit-area',
                    x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2),
                    stroke: 'transparent',
                    'stroke-width': String(hitWidth),
                }))
                g.appendChild(this.buildXOverlay(x1, (y1 + y2) / 2, s * 0.16))
                layer.appendChild(g)
                this.register(ref, g)
            }
        }
    }

    private buildVertices(layer: SVGGElement): void {
        for (let r = 0; r <= this.rows; r++) {
            for (let c = 0; c <= this.cols; c++) {
                const ref: ElementRef = { kind: 'vertex', row: r, col: c }
                const cx = this.pad + c * this.cellSize
                const cy = this.pad + r * this.cellSize
                const radius = this.vertexRadius

                const g = this.createGroup(ref)
                g.appendChild(this.createSvgEl('circle', {
                    class: 'puzzle-grid__shape',
                    cx: String(cx),
                    cy: String(cy),
                    r: String(radius),
                }))
                g.appendChild(this.buildXOverlay(cx, cy, radius * 0.7))
                layer.appendChild(g)
                this.register(ref, g)
            }
        }
    }

    private buildXOverlay(cx: number, cy: number, half: number): SVGGElement {
        const g = this.createSvgEl('g', { class: 'puzzle-grid__cross' }) as SVGGElement
        const d = half
        g.appendChild(this.createSvgEl('line', {
            class: 'puzzle-grid__cross-line',
            x1: String(cx - d), y1: String(cy - d),
            x2: String(cx + d), y2: String(cy + d),
            'vector-effect': 'non-scaling-stroke',
        }))
        g.appendChild(this.createSvgEl('line', {
            class: 'puzzle-grid__cross-line',
            x1: String(cx + d), y1: String(cy - d),
            x2: String(cx - d), y2: String(cy + d),
            'vector-effect': 'non-scaling-stroke',
        }))
        g.style.display = 'none'
        return g
    }

    private register(ref: ElementRef, g: SVGGElement): void {
        const id = this.elementId(ref)
        this.elements.set(id, g)
        const xo = g.querySelector(':scope > .puzzle-grid__cross') as SVGGElement | null
        if (xo) this.xOverlays.set(id, xo)
        this.updateElement(id, this.getState(ref))
    }

    private updateElement(id: string, state: ElementState): void {
        const g = this.elements.get(id)
        if (!g) return
        g.setAttribute('class', this.classFor(id, state))
        g.setAttribute('data-state', state)
        const xo = this.xOverlays.get(id)
        if (xo) xo.style.display = state === 'x' ? '' : 'none'
    }

    private kindFromId(id: string): { kind: ElementKind; orientation?: EdgeOrientation } {
        if (id.startsWith('edge-')) {
            return { kind: 'edge', orientation: id.startsWith('edge-v') ? 'vertical' : 'horizontal' }
        }
        if (id.startsWith('vertex')) return { kind: 'vertex' }
        return { kind: 'square' }
    }

    private classFor(id: string, state: ElementState): string {
        const { kind, orientation } = this.kindFromId(id)
        const kindClass = `puzzle-grid__${kind}`
        const orientationClass =
            kind === 'edge' ? ` ${kindClass}--${orientation}` : ''
        const stateClass = state === 'untouched' ? '' : ` ${kindClass}--${state}`
        const givenClass = this.readonlyCells.has(id) ? ` ${kindClass}--given` : ''
        return `${kindClass}${orientationClass}${stateClass}${givenClass}`
    }

    // -------------------------------------------------------------------------
    // Painting interaction
    // -------------------------------------------------------------------------

    private readonly onPointerDown = (e: PointerEvent) => {
        const ref = this.refFromTarget(e.target as Element | null)
        if (!ref) return

        const erase = e.button === 2 || e.ctrlKey || e.metaKey || e.shiftKey
        this.paintState = erase ? 'untouched' : this.nextPaintState(ref)
        this.painting = true
        this.lastPaintedId = null
        this.applyPaint(ref)

        if (e.button === 2) e.preventDefault()
    }

    private readonly onPointerMove = (e: PointerEvent) => {
        if (!this.painting) return
        const ref = this.refFromPoint(e.clientX, e.clientY)
        if (ref) this.applyPaint(ref)
    }

    private readonly onPointerUp = () => {
        this.painting = false
        this.lastPaintedId = null
    }

    private readonly onContextMenu = (e: Event) => {
        e.preventDefault()
    }

    private nextPaintState(ref: ElementRef): ElementState {
        const cycle = this.paintCycle[ref.kind]
        const current = this.getState(ref)
        const idx = cycle.indexOf(current)
        if (idx === -1) return cycle[0]
        return cycle[(idx + 1) % cycle.length]
    }

    private isImmutable(ref: ElementRef): boolean {
        const id = this.elementId(ref)
        if (this.immutableMap[ref.kind]) return true
        if (this.readonlyCells.has(id)) return true
        return this.getState(ref) === 'fixed'
    }

    private applyPaint(ref: ElementRef): void {
        const id = this.elementId(ref)
        if (id === this.lastPaintedId) return
        this.lastPaintedId = id
        if (this.isImmutable(ref)) return
        this.setState(ref, this.paintState)
    }

    private refFromPoint(x: number, y: number): ElementRef | null {
        return this.refFromTarget(document.elementFromPoint(x, y) as Element | null)
    }

    private refFromTarget(target: Element | null): ElementRef | null {
        const el = target?.closest?.('[data-kind]') as SVGGElement | null
        if (!el) return null
        const kind = el.getAttribute('data-kind') as ElementKind | null
        if (!kind) return null
        const row = Number(el.getAttribute('data-row'))
        const col = Number(el.getAttribute('data-col'))
        const orientation = (el.getAttribute('data-orientation') as EdgeOrientation | null) ?? undefined
        return { kind, row, col, orientation }
    }
}

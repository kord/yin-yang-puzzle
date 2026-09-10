import { useEffect, useRef } from 'react'
import './Confetti.css'

const COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899']

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** A lightweight canvas confetti burst. Active for the lifetime of `active`. */
export default function Confetti({ active }: { active: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)

    useEffect(() => {
        if (!active) return
        if (prefersReducedMotion()) return // no burst for reduced-motion users
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const dpr = window.devicePixelRatio || 1
        canvas.width = window.innerWidth * dpr
        canvas.height = window.innerHeight * dpr
        ctx.scale(dpr, dpr)

        const parts = Array.from({ length: 200 }, () => ({
            x: Math.random() * window.innerWidth,
            y: -20 - Math.random() * window.innerHeight * 0.6,
            vx: -2.5 + Math.random() * 5,
            vy: 2.5 + Math.random() * 5,
            size: 6 + Math.random() * 7,
            rot: Math.random() * Math.PI,
            vr: -0.25 + Math.random() * 0.5,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
        }))

        let raf = 0
        const tick = () => {
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
            let alive = false
            for (const p of parts) {
                p.x += p.vx
                p.y += p.vy
                p.rot += p.vr
                if (p.y < window.innerHeight + 40) alive = true
                ctx.save()
                ctx.translate(p.x, p.y)
                ctx.rotate(p.rot)
                ctx.fillStyle = p.color
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
                ctx.restore()
            }
            if (alive) raf = requestAnimationFrame(tick)
        }
        tick()

        return () => cancelAnimationFrame(raf)
    }, [active])

    if (!active) return null
    return <canvas ref={canvasRef} className="confetti" />
}

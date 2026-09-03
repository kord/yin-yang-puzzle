import { useEffect } from 'react'
import './HintModal.css'

const RULES = [
    {
        title: 'Every 2×2 has both colours',
        body: 'No four cells in a square can be the same colour. If three cells of a 2×2 are black (or white), the fourth must be the opposite colour.',
    },
    {
        title: 'Each colour forms one group',
        body: 'All black cells touch orthogonally as a single group, and so do all white cells. Don’t create a lone island, and never wall off a region so it can’t reach the rest of its colour.',
    },
    {
        title: 'No diagonal “pinch”',
        body: 'A 2×2 that alternates like ◼◻ / ◻◼ is forbidden. The colours would only meet at a corner, which would split one of them into two groups.',
    },
    {
        title: 'The border is two arcs',
        body: 'Walking around the outside, each colour occupies one continuous run — at most two colour changes. Pinning a border stone often forces its neighbours along the rim.',
    },
]

export default function HintModal({ onClose }: { onClose: () => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    return (
        <div className="hint-modal" onClick={onClose}>
            <div
                className="hint-modal__dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Solving hints"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="hint-modal__header">
                    <h2 className="hint-modal__title">Solving hints</h2>
                    <button
                        type="button"
                        className="hint-modal__close"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>
                <ul className="hint-modal__list">
                    {RULES.map((rule) => (
                        <li className="hint-modal__rule" key={rule.title}>
                            <h3 className="hint-modal__rule-title">{rule.title}</h3>
                            <p className="hint-modal__rule-body">{rule.body}</p>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}

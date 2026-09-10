import { useCallback, useEffect, useRef } from 'react'
import type { GenRequest, GenResponse } from '../puzzle/messages'

/**
 * Owns the puzzle-generation Worker for the lifetime of the component and
 * returns a stable `post` to send requests to it. Responses are delivered to
 * the latest `onResponse` (so callers don't have to worry about staleness).
 */
export function useGeneratorWorker(onResponse: (message: GenResponse) => void) {
    const handler = useRef(onResponse)

    // Keep the ref pointing at the newest callback. Declared before the worker
    // effect so it is up to date by the time the worker starts listening.
    useEffect(() => {
        handler.current = onResponse
    })

    const workerRef = useRef<Worker | null>(null)
    useEffect(() => {
        const worker = new Worker(new URL('../puzzle/generator.worker.ts', import.meta.url), {
            type: 'module',
        })
        workerRef.current = worker
        worker.onmessage = (e: MessageEvent<GenResponse>) => handler.current(e.data)
        return () => {
            worker.terminate()
            workerRef.current = null
        }
    }, [])

    return useCallback((request: GenRequest) => workerRef.current?.postMessage(request), [])
}

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipPlayer } from './ClipPlayer'
import { framesBetween, useRecording } from './useRecording'

/** The expert's screen at a moment, small in place, with "Enlarge" for a view as large as the screen. */
export function EnlargeableClip({ sessionId, start, end, title }: { sessionId: string | null; start: number; end: number; title: string }) {
  const [big, setBig] = useState(false)
  const recording = useRecording(sessionId)
  const hasFrames = useMemo(() => !!recording && framesBetween(recording.frames, start, end).length > 0, [recording, start, end])

  useEffect(() => {
    if (!big) return
    // Capture phase: Esc closes only the large view, not the window behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setBig(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [big])

  // 16:9 as large as fits, with room for the title and the close button.
  const size = 'w-[min(100%,1400px,calc((100vh-9rem)*16/9))]'

  return (
    <>
      <div className="relative">
        <ClipPlayer sessionId={sessionId} start={start} end={end} className="w-full" />
        {hasFrames ? (
          <button
            type="button"
            onClick={() => setBig(true)}
            className="absolute top-2 right-2 flex h-9 items-center gap-1.5 rounded-lg bg-black/60 px-3 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-black/75"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M8.5 1.5h4v4M5.5 12.5h-4v-4M12.5 1.5 8 6M1.5 12.5 6 8" />
            </svg>
            Enlarge
          </button>
        ) : null}
      </div>
      {big
        ? createPortal(
            // data-helpy: a click in here is not "outside" Helpy's panel (the panel would close and take this with it).
            <div
              data-helpy
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-3 bg-helpy-ink/90 p-6 font-helpy"
              onMouseDown={(e) => e.target === e.currentTarget && setBig(false)}
            >
              <div className={`flex items-center gap-3 text-white ${size}`}>
                <p className="m-0 min-w-0 flex-1 truncate text-[18px] font-medium">{title}</p>
                <button type="button" onClick={() => setBig(false)} className="h-10 rounded-lg bg-white/15 px-4 text-[15px] font-medium hover:bg-white/25">
                  Close
                </button>
              </div>
              <ClipPlayer sessionId={sessionId} start={start} end={end} className={size} />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

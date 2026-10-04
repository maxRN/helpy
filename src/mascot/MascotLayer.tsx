import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useMascot } from '../shared/mascot'
import { registry } from '../shared/registry'
import { useSession } from '../shared/session'
import { mascot } from './api'
import { dodge, homePosition, placeBubble, placeNextTo, type Box, type Side } from './placement'
import { Robot } from './Robot'
import { useHelpyExtras, type BubbleAction, type BubbleInput } from './store'

export const SIZE = { width: 84, height: 105 }
/** Flying to a field takes its time, so the eye can follow where Helpy goes (Sabine, 68). */
const FLY_MS = 1300
/** First guess before the bubble is measured (it is measured before it is painted). */
const BUBBLE_GUESS = { width: 336, height: 80 }

let clickHandler: (() => void) | null = null

/** What happens when someone clicks Helpy (e.g. "what's next?" in Teach). */
export function setMascotClickHandler(fn: (() => void) | null) {
  clickHandler = fn
}

const toBox = (r: DOMRect): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height })

export function visibleBounds(el: HTMLElement | null): Box {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (!el) return { left: 0, top: 0, width: vw, height: vh }
  const r = el.getBoundingClientRect()
  const left = Math.max(0, r.left)
  const top = Math.max(0, r.top)
  let right = Math.min(vw, r.right)
  // Panels that slide over the work area from the right (data-mascot-avoid) shrink the space.
  for (const avoid of document.querySelectorAll<HTMLElement>('[data-mascot-avoid]')) {
    const a = avoid.getBoundingClientRect()
    if (a.width > 0 && a.left > left && a.left < right) right = a.left
  }
  return { left, top, width: right - left, height: Math.min(vh, r.bottom) - top }
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a && !!b && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5)

interface Layout {
  x: number
  y: number
  side: Side | null
  ring: Box | null
  bounds: Box
}

/**
 * The floating mascot. Flies next to `targetId` (from the registry), shows a pulsing ring around it
 * and keeps the speech bubble on screen. Draggable; never leaves `boundsRef` (the main work area).
 */
export function MascotLayer({ boundsRef, hideBubble = false, badge }: { boundsRef?: RefObject<HTMLElement | null>; hideBubble?: boolean; badge?: ReactNode }) {
  const state = useMascot((s) => s.state)
  const bubbleText = useMascot((s) => s.bubble)
  const targetId = useMascot((s) => s.pointTarget)
  const extras = useHelpyExtras((s) => s.bubbleExtras)
  const tone = useHelpyExtras((s) => s.tone)
  const home = useHelpyExtras((s) => s.home)
  const pose = useHelpyExtras((s) => s.pose)
  const waiting = useMascot((s) => s.waiting !== null)
  const offRecord = useSession((s) => s.offRecord)

  const [layout, setLayout] = useState<Layout | null>(null)
  const [flying, setFlying] = useState(false)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [bubbleSize, setBubbleSize] = useState(BUBBLE_GUESS)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const showBubble = !!bubbleText && !hideBubble
  const dragStart = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null)

  useEffect(() => {
    mascot.restoreHome()
    // Tells the shared store a real mascot is on screen (turns off P1's fallback highlight).
    useMascot.setState({ rendered: true })
    return () => useMascot.setState({ rendered: false })
  }, [])

  useEffect(() => {
    setFlying(true)
    const timer = setTimeout(() => setFlying(false), FLY_MS + 50)
    if (targetId) {
      const el = registry.get(targetId)
      const r = el?.getBoundingClientRect()
      const b = visibleBounds(boundsRef?.current ?? null)
      if (el && r && (r.top < b.top || r.bottom > b.top + b.height)) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    return () => clearTimeout(timer)
  }, [targetId, boundsRef])

  useEffect(() => {
    const update = () => {
      const bounds = visibleBounds(boundsRef?.current ?? null)
      const el = targetId ? registry.get(targetId) : undefined
      const r = el?.getBoundingClientRect()
      const onScreen = !!r && r.width > 0 && r.height > 0 && r.bottom > bounds.top && r.top < bounds.top + bounds.height

      let next: Layout
      if (r && onScreen) {
        const ring = toBox(r)
        const p = placeNextTo(ring, SIZE, bounds, showBubble ? bubbleSize : null)
        next = { x: p.x, y: p.y, side: p.side, ring, bounds }
      } else {
        const active = document.activeElement
        const focused = active instanceof HTMLElement && active !== document.body && (boundsRef?.current ?? document.body).contains(active) ? toBox(active.getBoundingClientRect()) : null
        const p = dodge(homePosition(home, SIZE, bounds), SIZE, focused, bounds)
        next = { x: p.x, y: p.y, side: null, ring: null, bounds }
      }
      setLayout((prev) =>
        prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 && prev.side === next.side && sameBox(prev.ring, next.ring) && sameBox(prev.bounds, next.bounds)
          ? prev
          : next,
      )
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    document.addEventListener('focusin', update)
    const interval = setInterval(update, 250) // layout shifts (banners, route changes) have no event
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
      document.removeEventListener('focusin', update)
      clearInterval(interval)
    }
  }, [targetId, home, boundsRef, showBubble, bubbleSize])

  const own = extras?.text === bubbleText ? extras : null
  const actionCount = (own?.actions.length ?? 0) + (own?.input ? 1 + (own.input.suggestions?.length ?? 0) : 0)
  useLayoutEffect(() => {
    const el = bubbleRef.current
    if (!el) return
    const next = { width: el.offsetWidth, height: el.offsetHeight }
    setBubbleSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next))
  }, [showBubble, bubbleText, actionCount, layout?.bounds.width])

  if (!layout) return null

  const x = drag?.x ?? layout.x
  const y = drag?.y ?? layout.y
  // The pointing arm is on the robot's right; mirror it when the target is to its left.
  const flip = layout.side === 'right' || (layout.side === 'below' || layout.side === 'above' ? (layout.ring?.left ?? 0) + (layout.ring?.width ?? 0) / 2 < x + SIZE.width / 2 : false)
  // Around the robot, but never on the thing it points at and never off screen.
  const bubble = placeBubble({ left: x, top: y, ...SIZE }, bubbleSize, drag ? null : layout.ring, layout.bounds)

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStart.current = { px: e.clientX, py: e.clientY, x, y, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const s = dragStart.current
    if (!s) return
    const dx = e.clientX - s.px
    const dy = e.clientY - s.py
    if (!s.moved && Math.hypot(dx, dy) < 4) return
    s.moved = true
    setDrag({ x: s.x + dx, y: s.y + dy })
  }
  const onPointerUp = () => {
    const s = dragStart.current
    dragStart.current = null
    if (!s) return
    if (!s.moved) {
      clickHandler?.()
      return
    }
    if (drag) {
      const b = layout.bounds
      mascot.setHome({ right: b.left + b.width - (drag.x + SIZE.width), bottom: b.top + b.height - (drag.y + SIZE.height) })
      if (targetId) mascot.pointTo(null)
    }
    setDrag(null)
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50" data-helpy>
      {layout.ring && !drag ? (
        <div
          className="helpy-ring fixed"
          data-tone={tone}
          style={{ left: layout.ring.left - 6, top: layout.ring.top - 6, width: layout.ring.width + 12, height: layout.ring.height + 12 }}
        />
      ) : null}
      <div
        className="absolute left-0 top-0"
        style={{
          width: SIZE.width,
          height: SIZE.height,
          transform: `translate(${x}px, ${y}px)`,
          transition: drag ? 'none' : flying ? `transform ${FLY_MS}ms cubic-bezier(0.45, 0.05, 0.25, 1)` : 'transform 90ms linear',
        }}
      >
        {showBubble ? (
          <SpeechBubble
            key={bubbleText}
            ref={bubbleRef}
            text={bubbleText}
            tone={own?.tone ?? 'default'}
            actions={own?.actions ?? []}
            input={own?.input ?? null}
            offset={{ left: bubble.x - x, top: bubble.y - y }}
          />
        ) : null}
        <div
          role="button"
          tabIndex={0}
          aria-label="Helpy, your apprentice. Click for help, drag to move."
          title="Helpy · click for help, drag to move"
          className="pointer-events-auto cursor-grab touch-none select-none outline-none drop-shadow-[0_8px_14px_rgb(12_24_32/0.25)] focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-helpy-mint active:cursor-grabbing"
          style={{ transform: flip ? 'scaleX(-1)' : undefined }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragStart.current = null
            setDrag(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              clickHandler?.()
            }
          }}
        >
          <Robot state={state} pose={pose ?? (waiting ? 'question' : null)} pointing={!!layout.ring && !drag} off={offRecord} size={SIZE.width} />
        </div>
        {badge ? <div className="pointer-events-none absolute bottom-[calc(100%-12px)] left-1/2 -translate-x-1/2">{badge}</div> : null}
      </div>
    </div>
  )
}

/** Helpy asks, you answer: a text field (Enter sends) and one-tap suggestions. */
function BubbleForm({ input }: { input: BubbleInput }) {
  const [value, setValue] = useState('')
  const send = (v: string) => v.trim() && input.onSubmit(v.trim())
  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        send(value)
      }}
    >
      <div className="flex gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={input.placeholder}
          aria-label={input.placeholder}
          className="h-11 min-w-0 flex-1 rounded-lg bg-white px-3 text-[16px] text-ink outline-none placeholder:text-faint focus:ring-2 focus:ring-helpy-mint"
        />
        <button type="submit" disabled={!value.trim()} className="h-11 shrink-0 rounded-lg bg-white px-3.5 text-[15px] font-semibold text-helpy transition-colors duration-150 hover:bg-helpy-soft disabled:opacity-60">
          {input.submitLabel}
        </button>
      </div>
      {input.suggestions?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {input.suggestions.map((s) => (
            <button key={s} type="button" onClick={() => send(s)} className="min-h-9 rounded-full bg-white/15 px-3 py-1 text-left text-[14px] font-medium text-white transition-colors duration-150 hover:bg-white/25">
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  )
}

function SpeechBubble({
  ref,
  text,
  tone,
  actions,
  input,
  offset,
}: {
  ref: RefObject<HTMLDivElement | null>
  text: string
  tone: 'default' | 'alert'
  actions: BubbleAction[]
  input: BubbleInput | null
  offset: { left: number; top: number }
}) {
  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className={`helpy-pop pointer-events-auto absolute ${input ? 'w-[min(21rem,calc(100vw-2rem))]' : 'w-max'} max-w-[min(21rem,calc(100vw-2rem))] rounded-2xl bg-helpy px-4 py-3.5 font-helpy text-[16px] font-medium leading-snug text-white shadow-float ${
        tone === 'alert' ? 'ring-2 ring-[#f04438]' : ''
      }`}
      style={offset}
    >
      <p className="m-0">{text}</p>
      {input ? <BubbleForm input={input} /> : null}
      {actions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className={`min-h-9 rounded-lg px-3.5 py-1.5 text-[14px] font-semibold transition-colors duration-150 ${
                a.primary ? 'bg-white text-helpy hover:bg-helpy-soft' : 'bg-white/15 text-white hover:bg-white/25'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

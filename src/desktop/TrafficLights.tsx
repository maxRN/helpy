// macOS-style window controls ("traffic lights"): close, minimize, zoom, top left of a window.
// The glyphs show while the pointer is over the group, like on a Mac. Real buttons with the usual labels.

const LIGHT = 'flex size-3 items-center justify-center rounded-full ring-1 ring-inset ring-black/15 outline-none focus-visible:ring-2 focus-visible:ring-sky-500'

export function TrafficLights({
  onClose,
  onMinimize,
  onZoom,
  zoomed = false,
}: {
  onClose: () => void
  /** Without it, the yellow light is shown greyed out (the window cannot be minimized). */
  onMinimize?: () => void
  onZoom: () => void
  zoomed?: boolean
}) {
  return (
    <span className="group flex items-center gap-2" onDoubleClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label="Close" title="Close" className={`${LIGHT} bg-[#ff5f57]`} onClick={onClose}>
        <svg width="6" height="6" viewBox="0 0 6 6" className="opacity-0 group-hover:opacity-100" aria-hidden>
          <path d="M1 1l4 4M5 1L1 5" stroke="#4d0000" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      </button>
      {onMinimize ? (
        <button type="button" aria-label="Minimize" title="Minimize" className={`${LIGHT} bg-[#febc2e]`} onClick={onMinimize}>
          <svg width="6" height="6" viewBox="0 0 6 6" className="opacity-0 group-hover:opacity-100" aria-hidden>
            <path d="M1 3h4" stroke="#5a3d00" strokeWidth="1.1" strokeLinecap="round" />
          </svg>
        </button>
      ) : (
        <span className={`${LIGHT} bg-[#d6d6d6]`} aria-hidden />
      )}
      <button type="button" aria-label={zoomed ? 'Restore' : 'Maximize'} title={zoomed ? 'Exit full size' : 'Full size'} className={`${LIGHT} bg-[#28c840]`} onClick={onZoom}>
        <svg width="6" height="6" viewBox="0 0 6 6" className="opacity-0 group-hover:opacity-100" aria-hidden>
          <path d={zoomed ? 'M0.8 3.2h2v2M5.2 2.8h-2v-2' : 'M1 2.6V1h1.6M5 3.4V5H3.4'} stroke="#0a4a00" strokeWidth="1.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </span>
  )
}

/** Title bar of a macOS-style window: traffic lights left, title centered. Double-click zooms. */
export const TITLE_BAR = 'relative flex h-9 shrink-0 items-center border-b border-[#d4d4d4] bg-gradient-to-b from-[#f2f2f2] to-[#e4e4e4] px-3 select-none'
export const TITLE_TEXT = 'pointer-events-none absolute inset-x-24 flex items-center justify-center gap-1.5 truncate text-[13px] font-medium text-[#3c3c3c]'

/** Where a window sits on the mock desktop: below the menu bar, above the dock. */
export const windowPlacement = (maximized: boolean) =>
  maximized ? 'inset-x-0 top-7 bottom-12' : 'top-[calc(1.75rem+3%)] right-[3%] bottom-[calc(3rem+3%)] left-[3%] rounded-[10px]'

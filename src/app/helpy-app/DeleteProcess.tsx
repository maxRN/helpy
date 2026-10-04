import { useMutation } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { Process } from '../panel/processes'
import { usePanel } from '../panel/store'

/**
 * Delete a process with everything recorded for it, after one confirmation. Not offered for the hand-written example
 * (it is not stored) nor while this browser is recording it; a recording left unfinished elsewhere can be deleted.
 * `compact`: a trash icon for a row in the list; otherwise a text button next to "Rename".
 */
export function DeleteProcess({ process, compact = false, onDeleted }: { process: Process; compact?: boolean; onDeleted?: () => void }) {
  const remove = useMutation(api.projects.remove)
  const recordingHere = usePanel((s) => s.activity?.kind === 'recording' && s.activity.processId === process.id)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  if (process.example || recordingHere) return null

  const confirm = async () => {
    setDeleting(true)
    setError('')
    try {
      await remove({ projectId: process.id as Id<'projects'>, force: true })
      onDeleted?.()
    } catch {
      setError('Couldn’t delete it. Please try again.')
      setDeleting(false)
    }
  }

  return (
    // Inside a clickable row: clicks here never open the process.
    <span className={`inline-flex items-center justify-end gap-2 ${compact && !error ? 'flex-nowrap' : 'flex-wrap'}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {confirming ? (
        <>
          {!compact ? <span className="text-[15px] text-ink">Delete “{process.name}” and its recordings?</span> : null}
          <button
            type="button"
            autoFocus
            disabled={deleting}
            onClick={() => void confirm()}
            className="h-9 rounded-lg bg-guard px-3 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-[#82211f] disabled:opacity-60"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => setConfirming(false)}
            className="h-9 rounded-lg px-2 text-[15px] font-medium text-muted transition-colors duration-150 hover:text-ink"
          >
            Cancel
          </button>
          {error ? <span className="basis-full text-right text-[14px] text-guard">{error}</span> : null}
        </>
      ) : compact ? (
        <button
          type="button"
          aria-label={`Delete ${process.name}`}
          title="Delete"
          onClick={() => setConfirming(true)}
          className="flex size-9 items-center justify-center rounded-lg text-faint transition-colors duration-150 hover:bg-guard-soft hover:text-guard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-helpy-mint"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5.5 5.5l.7 10.6a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9l.7-10.6M8.5 9v5M11.5 9v5" />
          </svg>
        </button>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="h-10 rounded-lg px-2 text-[15px] font-medium text-guard transition-colors duration-150 hover:text-[#82211f]">
          Delete
        </button>
      )}
    </span>
  )
}

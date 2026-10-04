import { create } from 'zustand'
import type { Id } from '../../convex/_generated/dataModel'
import type { Screenshot } from './screen'

type Stage = { kind: 'processing' | 'uploading' | 'saved' } | { kind: 'failed'; error: string }
type Preview = Omit<Screenshot, 'blob'> & { taskId: Id<'tasks'>; url: string; stage: Stage }

export const usePendingScreenshots = create<{ screenshots: Preview[] }>(() => ({ screenshots: [] }))

export function addPreview(taskId: Id<'tasks'>, { blob, ...timestamps }: Screenshot) {
  usePendingScreenshots.setState(({ screenshots }) => ({ screenshots: [...screenshots, {
    taskId, ...timestamps, url: URL.createObjectURL(blob), stage: { kind: 'processing' },
  }] }))
}

export function updatePreview(taskId: Id<'tasks'>, offsetMs: number, stage: Stage, blob?: Blob) {
  usePendingScreenshots.setState(({ screenshots }) => ({ screenshots: screenshots.map((shot) => {
    if (shot.taskId !== taskId || shot.offsetMs !== offsetMs) return shot
    if (blob) URL.revokeObjectURL(shot.url)
    return { ...shot, stage, url: blob ? URL.createObjectURL(blob) : shot.url }
  }) }))
}

export function releasePreviews(taskId: string, offsets: number[]) {
  usePendingScreenshots.setState(({ screenshots }) => ({ screenshots: screenshots.filter((shot) => {
    if (shot.taskId !== taskId || !offsets.includes(shot.offsetMs) || !['saved', 'failed'].includes(shot.stage.kind)) return true
    URL.revokeObjectURL(shot.url)
    return false
  }) }))
}

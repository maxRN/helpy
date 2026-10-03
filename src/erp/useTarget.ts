import { useMemo } from 'react'
import { registerTarget } from '../shared/registry'

/** Stable ref callback that registers the element under `targetId` (sets data-target). */
export const useTarget = (targetId: string) => useMemo(() => registerTarget(targetId), [targetId])

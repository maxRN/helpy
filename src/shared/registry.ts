// Maps data-target ids of ERP elements to their DOM nodes.
// Used by the mascot (pointTo) and by capture (PII masking).

const elements = new Map<string, HTMLElement>()

export const registry = {
  set(targetId: string, el: HTMLElement) {
    elements.set(targetId, el)
  },
  delete(targetId: string, el?: HTMLElement) {
    // Only remove if it is still the same node (React may mount the new one first).
    if (!el || elements.get(targetId) === el) elements.delete(targetId)
  },
  get(targetId: string): HTMLElement | undefined {
    const el = elements.get(targetId)
    return el?.isConnected ? el : undefined
  },
  ids(): string[] {
    return [...elements.keys()]
  },
}

/** Ref callback that registers an element under a target id. */
export function registerTarget(targetId: string) {
  let current: HTMLElement | null = null
  return (el: HTMLElement | null) => {
    if (el) {
      current = el
      el.dataset.target = targetId
      registry.set(targetId, el)
    } else if (current) {
      registry.delete(targetId, current)
      current = null
    }
  }
}

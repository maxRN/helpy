// When did the screen last change visibly? Capture (P3) marks changes, the pause detector (P2) reads them.
// 0 means "never": the pause detector then treats the screen as still.

let last = 0

export function markFrameChange(at = Date.now()) {
  last = at
}

export const lastFrameChangeAt = () => last

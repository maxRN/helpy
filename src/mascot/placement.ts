// Where the mascot stands next to a target. Pure, so it can be tested without a DOM.

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export type Side = 'right' | 'left' | 'below' | 'above'

export interface Placement {
  x: number
  y: number
  side: Side
}

const GAP = 14
const MARGIN = 8

const right = (b: Box) => b.left + b.width
const bottom = (b: Box) => b.top + b.height

function overlap(a: Box, b: Box): number {
  const w = Math.min(right(a), right(b)) - Math.max(a.left, b.left)
  const h = Math.min(bottom(a), bottom(b)) - Math.max(a.top, b.top)
  return w > 0 && h > 0 ? w * h : 0
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max))

/** How much of `box` covers the controls in `avoid` (buttons, fields the user may need next). */
const covered = (box: Box, avoid: readonly Box[]) => avoid.reduce((sum, a) => sum + overlap(box, a), 0)

/** Covering the target (or the robot, for the bubble) is never worth it; other controls only as little as possible. */
const NEVER = 1000

/**
 * Tries right, left, below, above (in that order, centered first, then along the target's edges) and takes
 * the first spot that fits inside `bounds` without covering the target or any control in `avoid`.
 * If none does, takes the one that covers the least (the target counts far more than other controls).
 * With a `bubble`, the speech bubble (see placeBubble) is placed by the same rules.
 */
export function placeNextTo(
  target: Box,
  size: { width: number; height: number },
  bounds: Box,
  bubble: { width: number; height: number } | null = null,
  avoid: readonly Box[] = [],
): Placement {
  const midY = target.top + target.height / 2 - size.height / 2
  const midX = target.left + target.width / 2 - size.width / 2
  const rightX = right(target) + GAP
  const leftX = target.left - GAP - size.width
  const belowY = bottom(target) + GAP
  const aboveY = target.top - GAP - size.height
  const candidates: Placement[] = [
    { side: 'right', x: rightX, y: midY },
    { side: 'left', x: leftX, y: midY },
    { side: 'below', x: midX, y: belowY },
    { side: 'above', x: midX, y: aboveY },
    { side: 'right', x: rightX, y: target.top },
    { side: 'right', x: rightX, y: bottom(target) - size.height },
    { side: 'left', x: leftX, y: target.top },
    { side: 'left', x: leftX, y: bottom(target) - size.height },
    { side: 'below', x: target.left, y: belowY },
    { side: 'below', x: right(target) - size.width, y: belowY },
    { side: 'above', x: target.left, y: aboveY },
    { side: 'above', x: right(target) - size.width, y: aboveY },
  ]

  let best: { p: Placement; cost: number } | null = null
  for (const c of candidates) {
    const fits =
      c.x >= bounds.left + MARGIN &&
      c.y >= bounds.top + MARGIN &&
      c.x + size.width <= right(bounds) - MARGIN &&
      c.y + size.height <= bottom(bounds) - MARGIN
    const p: Placement = {
      side: c.side,
      x: clamp(c.x, bounds.left + MARGIN, right(bounds) - MARGIN - size.width),
      y: clamp(c.y, bounds.top + MARGIN, bottom(bounds) - MARGIN - size.height),
    }
    const robot = { left: p.x, top: p.y, ...size }
    let cost = overlap(robot, target) * NEVER + covered(robot, avoid)
    if (bubble) {
      const b = placeBubble(robot, bubble, target, bounds, avoid)
      const box = { left: b.x, top: b.y, ...bubble }
      cost += (overlap(box, target) + overlap(box, robot)) * NEVER + covered(box, avoid)
    }
    if (fits && cost === 0) return p
    if (!best || cost < best.cost) best = { p, cost }
  }
  return best!.p
}

const BUBBLE_GAP = 6

/**
 * Where the speech bubble goes around the robot: above or below it (stretching towards the middle of
 * the screen first), else beside it. Takes the first spot inside `bounds` that covers neither the
 * robot nor the target, else the one that covers the target least.
 */
export function placeBubble(robot: Box, bubble: { width: number; height: number }, target: Box | null, bounds: Box, avoid: readonly Box[] = []): { x: number; y: number } {
  const midX = robot.left + robot.width / 2
  const towardsLeft = midX > bounds.left + bounds.width / 2
  const xs = [
    towardsLeft ? right(robot) - bubble.width : robot.left,
    midX - bubble.width / 2,
    towardsLeft ? robot.left : right(robot) - bubble.width,
  ]
  const above = robot.top - BUBBLE_GAP - bubble.height
  const below = bottom(robot) + BUBBLE_GAP
  const besideY = robot.top + robot.height / 2 - bubble.height / 2
  const candidates = [
    ...xs.map((x) => ({ x, y: above })),
    ...xs.map((x) => ({ x, y: below })),
    { x: right(robot) + BUBBLE_GAP, y: besideY },
    { x: robot.left - BUBBLE_GAP - bubble.width, y: besideY },
  ]

  let best: { x: number; y: number; cost: number } | null = null
  for (const c of candidates) {
    const fits =
      c.x >= bounds.left + MARGIN && c.y >= bounds.top + MARGIN && c.x + bubble.width <= right(bounds) - MARGIN && c.y + bubble.height <= bottom(bounds) - MARGIN
    const p = {
      x: clamp(c.x, bounds.left + MARGIN, right(bounds) - MARGIN - bubble.width),
      y: clamp(c.y, bounds.top + MARGIN, bottom(bounds) - MARGIN - bubble.height),
    }
    const box = { left: p.x, top: p.y, ...bubble }
    const cost = ((target ? overlap(box, target) : 0) + overlap(box, robot)) * NEVER + covered(box, avoid)
    if (fits && cost === 0) return p
    if (!best || cost < best.cost) best = { ...p, cost }
  }
  return { x: best!.x, y: best!.y }
}

/** Resting spot in the bottom-right corner of `bounds`, offset by the user's drag. */
export function homePosition(home: { right: number; bottom: number }, size: { width: number; height: number }, bounds: Box) {
  return {
    x: clamp(right(bounds) - home.right - size.width, bounds.left + MARGIN, right(bounds) - MARGIN - size.width),
    y: clamp(bottom(bounds) - home.bottom - size.height, bounds.top + MARGIN, bottom(bounds) - MARGIN - size.height),
  }
}

/** Moves the resting spot out of the way when it would cover `avoid` (e.g. the focused field). */
/** Moves the resting spot up and/or left in small steps until it covers none of the controls in `avoid`. */
export function clearSpot(pos: { x: number; y: number }, size: { width: number; height: number }, avoid: readonly Box[], bounds: Box) {
  const cost = (p: { x: number; y: number }) => covered({ left: p.x, top: p.y, ...size }, avoid)
  let best = { ...pos, cost: cost(pos) }
  if (best.cost === 0) return pos
  for (let k = 1; k <= 10; k++) {
    for (const c of [
      { x: pos.x, y: pos.y - 40 * k },
      { x: pos.x - 40 * k, y: pos.y },
      { x: pos.x - 40 * k, y: pos.y - 40 * k },
    ]) {
      const p = {
        x: clamp(c.x, bounds.left + MARGIN, right(bounds) - MARGIN - size.width),
        y: clamp(c.y, bounds.top + MARGIN, bottom(bounds) - MARGIN - size.height),
      }
      const n = cost(p)
      if (n === 0) return p
      if (n < best.cost) best = { ...p, cost: n }
    }
  }
  return { x: best.x, y: best.y }
}

export function dodge(pos: { x: number; y: number }, size: { width: number; height: number }, avoid: Box | null, bounds: Box) {
  if (!avoid || overlap({ left: pos.x, top: pos.y, ...size }, avoid) === 0) return pos
  const above = avoid.top - GAP - size.height
  if (above >= bounds.top + MARGIN) return { x: pos.x, y: above }
  return { x: clamp(avoid.left - GAP - size.width, bounds.left + MARGIN, right(bounds) - MARGIN - size.width), y: pos.y }
}

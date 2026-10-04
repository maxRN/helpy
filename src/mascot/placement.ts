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

/**
 * Tries right, left, below, above (in that order) and takes the first spot that fits inside
 * `bounds` without covering the target. If none fits, takes the one that covers it least.
 * With a `bubble`, the speech bubble (see placeBubble) must fit too, without covering the target or the robot.
 */
export function placeNextTo(target: Box, size: { width: number; height: number }, bounds: Box, bubble: { width: number; height: number } | null = null): Placement {
  const midY = target.top + target.height / 2 - size.height / 2
  const midX = target.left + target.width / 2 - size.width / 2
  const candidates: Placement[] = [
    { side: 'right', x: right(target) + GAP, y: midY },
    { side: 'left', x: target.left - GAP - size.width, y: midY },
    { side: 'below', x: midX, y: bottom(target) + GAP },
    { side: 'above', x: midX, y: target.top - GAP - size.height },
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
    let cost = overlap(robot, target)
    if (bubble) {
      const b = placeBubble(robot, bubble, target, bounds)
      const box = { left: b.x, top: b.y, ...bubble }
      cost += overlap(box, target) + overlap(box, robot)
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
export function placeBubble(robot: Box, bubble: { width: number; height: number }, target: Box | null, bounds: Box): { x: number; y: number } {
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
    const cost = (target ? overlap(box, target) : 0) + overlap(box, robot)
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
export function dodge(pos: { x: number; y: number }, size: { width: number; height: number }, avoid: Box | null, bounds: Box) {
  if (!avoid || overlap({ left: pos.x, top: pos.y, ...size }, avoid) === 0) return pos
  const above = avoid.top - GAP - size.height
  if (above >= bounds.top + MARGIN) return { x: pos.x, y: above }
  return { x: clamp(avoid.left - GAP - size.width, bounds.left + MARGIN, right(bounds) - MARGIN - size.width), y: pos.y }
}

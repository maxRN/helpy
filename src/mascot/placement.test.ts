import { describe, expect, it } from 'vitest'
import { centerPosition, clampInto, mascotMode, placeNextTo, placeStatus, REST_INSET, restPosition, type Box } from './placement'

const SIZE = { width: 84, height: 105 }
// The fake screen between the menu bar and the dock on a 1440 × 900 viewport (Helpy's bounds are fixed to the viewport).
const viewport = (width = 1440, height = 900 - 48): Box => ({ left: 0, top: 0, width, height })

describe('restPosition', () => {
  it('rests in the bottom-right corner of the viewport with a fixed inset', () => {
    expect(restPosition(viewport(), SIZE)).toEqual({ x: 1440 - REST_INSET.right - 84, y: 852 - REST_INSET.bottom - 105 })
  })

  it('does not depend on scrolling: same viewport, same spot, whatever the page does', () => {
    // A long page scrolled top -> bottom -> top: the bounds are the viewport, so they never change.
    const spots = [0, 1200, 4800, 1200, 0].map(() => restPosition(viewport(), SIZE))
    expect(new Set(spots.map((p) => `${p.x},${p.y}`)).size).toBe(1)
  })

  it('follows the viewport on resize and stays fully visible, also on very small screens', () => {
    const b = viewport(800, 500)
    expect(restPosition(b, SIZE)).toEqual({ x: 800 - 24 - 84, y: 500 - 24 - 105 })
    const tiny = viewport(120, 130)
    const p = restPosition(tiny, SIZE)
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.y).toBeGreaterThanOrEqual(0)
    expect(p.x + SIZE.width).toBeLessThanOrEqual(120)
  })

  it('steps aside only for the field the user is typing in', () => {
    const rest = restPosition(viewport(), SIZE)
    const field: Box = { left: rest.x - 100, top: rest.y + 20, width: 300, height: 32 }
    const p = restPosition(viewport(), SIZE, field)
    expect(p.y + SIZE.height).toBeLessThanOrEqual(field.top)
    expect(restPosition(viewport(), SIZE, null)).toEqual(rest) // field blurred: straight back
  })
})

describe('mascot state', () => {
  it('pointing beats a previous drag, dragging beats everything, otherwise it rests', () => {
    expect(mascotMode({ pointingAt: false, dragging: false, dragged: false })).toBe('resting')
    expect(mascotMode({ pointingAt: true, dragging: false, dragged: true })).toBe('pointing')
    expect(mascotMode({ pointingAt: true, dragging: true, dragged: false })).toBe('dragging')
    expect(mascotMode({ pointingAt: false, dragging: false, dragged: true })).toBe('dragged')
  })

  it('a dropped position is kept inside the viewport, e.g. after it shrinks', () => {
    expect(clampInto({ x: 1300, y: 800 }, SIZE, viewport(800, 500))).toEqual({ x: 800 - 8 - 84, y: 500 - 8 - 105 })
  })

  it('while explaining it stands next to the target, and returns to the same resting spot afterwards', () => {
    const before = restPosition(viewport(), SIZE)
    const target: Box = { left: 400, top: 300, width: 200, height: 32 }
    const p = placeNextTo(target, SIZE, viewport())
    expect(p.side).toBe('right')
    expect(p.x).toBeGreaterThanOrEqual(target.left + target.width)
    expect(restPosition(viewport(), SIZE)).toEqual(before)
  })
})

describe('placeStatus (what Helpy hears, above the robot)', () => {
  const screen = viewport()
  const robotAt = (x: number, y: number): Box => ({ left: x, top: y, ...SIZE })
  const card = (height: number) => ({ width: 300, height })

  it('at the resting spot lines up with the right edge of the robot and stays on screen', () => {
    const robot = robotAt(1440 - REST_INSET.right - 84, 852 - REST_INSET.bottom - 105)
    const p = placeStatus(robot, card(60), screen)
    expect(robot.left + p.left + 300).toBe(robot.left + 84)
    expect(robot.left + p.left).toBeGreaterThanOrEqual(8)
  })

  it('does not move sideways while the text grows, only upwards', () => {
    const robot = robotAt(1300, 700)
    const short = placeStatus(robot, card(30), screen)
    const long = placeStatus(robot, card(70), screen)
    expect(long.left).toBe(short.left)
    expect(long.top).toBe(short.top - 40)
  })

  it('on the left half lines up with the left edge, never leaving the screen', () => {
    expect(placeStatus(robotAt(200, 400), card(40), screen).left).toBe(0)
    expect(placeStatus(robotAt(2, 400), card(40), screen).left + 2).toBe(8)
  })

  it('goes below the robot when there is no room above', () => {
    expect(placeStatus(robotAt(600, 20), card(60), screen).top).toBeGreaterThanOrEqual(105)
  })
})

describe('centerPosition (the first hello)', () => {
  it('is horizontally centered on the screen', () => {
    expect(centerPosition(viewport(), SIZE).x).toBe(720 - 42)
  })
})

import type { RedactLabel } from '@desert-ant-labs/redact'
import type { OcrResult } from './ocr-contract'

const values = new Map<string, string>(Object.entries({
  GIVEN_NAME: 'Alex', SURNAME: 'Morgan', STREET_NAME: 'Example Street',
  BUILDING_NUMBER: '42', SECONDARY_ADDRESS: 'Suite 2', CITY: 'Sampletown',
  STATE: 'Example State', ZIP_CODE: '00000', EMAIL: 'alex@example.com',
  PHONE: '+1 202 555 0147', CREDIT_CARD: '0000 0000 0000 0000',
  BANK_ACCOUNT: 'DE00 0000 0000 0000 0000 00', ROUTING_NUMBER: '000000000',
  IP_ADDRESS: '192.0.2.1', URL: 'https://example.com', GOVERNMENT_ID: 'ID0000000',
  PASSPORT: 'P0000000', DRIVERS_LICENSE: 'DL0000000', TAX_ID: '00000000000',
  SSN: '000-00-0000', IMEI: '000000000000000', ORG: 'Example Company',
} satisfies Record<RedactLabel, string>))

export function syntheticPii(label: string) {
  const value = values.get(label)
  if (value === undefined) throw new Error(`Unknown PII category: ${label}.`)
  return value
}

type Box = OcrResult['regions'][number]['bbox']

function backgroundColor(context: CanvasRenderingContext2D, box: Box) {
  const left = Math.max(0, Math.floor(box.x0) - 2)
  const top = Math.max(0, Math.floor(box.y0) - 2)
  const right = Math.min(context.canvas.width, Math.ceil(box.x1) + 2)
  const bottom = Math.min(context.canvas.height, Math.ceil(box.y1) + 2)
  const { data, width, height } = context.getImageData(left, top, right - left, bottom - top)
  const colors = new Map<number, number>()
  function sample(x: number, y: number) {
    const offset = (y * width + x) * 4
    const red = data[offset], green = data[offset + 1], blue = data[offset + 2]
    const key = (red << 16) | (green << 8) | blue
    colors.set(key, (colors.get(key) ?? 0) + 1)
  }
  for (let x = 0; x < width; x++) { sample(x, 0); sample(x, height - 1) }
  for (let y = 1; y < height - 1; y++) { sample(0, y); sample(width - 1, y) }
  let dominant: number | undefined
  let largestCount = 0
  for (const [color, count] of colors) if (count > largestCount) { dominant = color; largestCount = count }
  if (dominant === undefined) throw new Error('Could not sample the screenshot background.')
  return { red: dominant >> 16, green: (dominant >> 8) & 255, blue: dominant & 255 }
}

export function paintSyntheticPii(context: CanvasRenderingContext2D, replacements: { box: Box; text: string }[]) {
  const masks = replacements.map((replacement) => ({ ...replacement, background: backgroundColor(context, replacement.box) }))
  context.save()
  try {
    for (const { box, background } of masks) {
      context.fillStyle = `rgb(${background.red}, ${background.green}, ${background.blue})`
      context.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0)
    }
    for (const { box, text, background } of masks) {
      context.save()
      context.beginPath()
      context.rect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0)
      context.clip()
      context.fillStyle = background.red * 0.299 + background.green * 0.587 + background.blue * 0.114 > 150 ? '#111' : '#fff'
      const fontSize = (box.y1 - box.y0) * 1.15
      context.font = `${fontSize}px sans-serif`
      const textWidth = context.measureText(text).width
      if (textWidth > box.x1 - box.x0) context.font = `${fontSize * (box.x1 - box.x0) / textWidth}px sans-serif`
      context.textBaseline = 'middle'
      context.fillText(text, box.x0, (box.y0 + box.y1) / 2, box.x1 - box.x0)
      context.restore()
    }
  } finally { context.restore() }
}

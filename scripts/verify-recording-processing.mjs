import assert from 'node:assert/strict'
import { loadEnvFile } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api.js'

loadEnvFile('.env.local')
if (!process.env.CONVEX_DEPLOYMENT?.startsWith('dev:')) throw new Error('This verification only runs against a development deployment.')
const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL)
const projectId = await client.mutation(api.projects.create, { name: '[verification] Background recording' })
const startedAt = Date.now()
const taskId = await client.mutation(api.tasks.create, { projectId, startedAt })
const getTask = () => client.query(api.tasks.get, { projectId, taskId })
const inspect = process.argv.includes('--inspect')
const pause = async (label) => {
  if (!inspect) return
  console.log(`${label}: http://localhost:3000/projects/${projectId}/tasks/${taskId}`)
  const input = createInterface({ input: process.stdin, output: process.stdout })
  await input.question('Press Enter after inspecting the task view. ')
  input.close()
}
try {
  const firstId = await client.mutation(api.tasks.addScreenshot, { taskId, capturedAt: startedAt, offsetMs: 0 })
  assert.equal(await client.mutation(api.tasks.addScreenshot, { taskId, capturedAt: startedAt, offsetMs: 0 }), firstId)
  await client.mutation(api.tasks.finish, { taskId, durationMs: 4_000, error: null, processing: true })
  let task = await getTask()
  assert.equal(task.completion.durationMs, 4_000)
  assert.equal(task.processing.kind, 'processing')
  assert.equal(task.screenshots[0].ocr.kind, 'pending')
  assert.equal(task.screenshots[0].url, null)
  await assert.rejects(client.mutation(api.tasks.completeProcessing, { taskId, error: null }), /still processing/)
  await assert.rejects(client.mutation(api.tasks.remove, { taskId }), /Finish processing/)
  await assert.rejects(client.mutation(api.projects.remove, { projectId }), /Finish recording and processing/)

  // Encoding and registration may finish after Done, but captured offsets stay inside the recording.
  const secondId = await client.mutation(api.tasks.addScreenshot, { taskId, capturedAt: startedAt + 2_000, offsetMs: 2_000 })
  await assert.rejects(client.mutation(api.tasks.addScreenshot, { taskId, capturedAt: startedAt + 5_000, offsetMs: 5_000 }), /Invalid screenshot timestamp/)
  const url = await client.mutation(api.tasks.generateUploadUrl, { taskId })
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: Buffer.from('/9j/4AAQSkZJRgABAQAASABIAAD/4QBARXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/+IRrElDQ19QUk9GSUxFAAEBAAARnGFwcGwCAAAAbW50ckdSQVlYWVogB9wACAAXAA8ALgAPYWNzcEFQUEwAAAAAbm9uZQAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1hcHBsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFZGVzYwAAAMAAAAB5ZHNjbQAAATwAAAgaY3BydAAACVgAAAAjd3RwdAAACXwAAAAUa1RSQwAACZAAAAgMZGVzYwAAAAAAAAAfR2VuZXJpYyBHcmF5IEdhbW1hIDIuMiBQcm9maWxlAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAG1sdWMAAAAAAAAAHwAAAAxza1NLAAAALgAAAYRkYURLAAAAOgAAAbJjYUVTAAAAOAAAAex2aVZOAAAAQAAAAiRwdEJSAAAASgAAAmR1a1VBAAAALAAAAq5mckZVAAAAPgAAAtpodUhVAAAANAAAAxh6aFRXAAAAGgAAA0xrb0tSAAAAIgAAA2ZuYk5PAAAAOgAAA4hjc0NaAAAAKAAAA8JoZUlMAAAAJAAAA+pyb1JPAAAAKgAABA5kZURFAAAATgAABDhpdElUAAAATgAABIZzdlNFAAAAOAAABNR6aENOAAAAGgAABQxqYUpQAAAAJgAABSZlbEdSAAAAKgAABUxwdFBPAAAAUgAABXZubE5MAAAAQAAABchlc0VTAAAATAAABgh0aFRIAAAAMgAABlR0clRSAAAAJAAABoZmaUZJAAAARgAABqpockhSAAAAPgAABvBwbFBMAAAASgAABy5hckVHAAAALAAAB3hydVJVAAAAOgAAB6RlblVTAAAAPAAAB94AVgFhAGUAbwBiAGUAYwBuAOEAIABzAGkAdgDhACAAZwBhAG0AYQAgADIALAAyAEcAZQBuAGUAcgBpAHMAawAgAGcAcgDlACAAMgAsADIAIABnAGEAbQBtAGEALQBwAHIAbwBmAGkAbABHAGEAbQBtAGEAIABkAGUAIABnAHIAaQBzAG8AcwAgAGcAZQBuAOgAcgBpAGMAYQAgADIALgAyAEMepQB1ACAAaADsAG4AaAAgAE0A4AB1ACAAeADhAG0AIABDAGgAdQBuAGcAIABHAGEAbQBtAGEAIAAyAC4AMgBQAGUAcgBmAGkAbAAgAEcAZQBuAOkAcgBpAGMAbwAgAGQAYQAgAEcAYQBtAGEAIABkAGUAIABDAGkAbgB6AGEAcwAgADIALAAyBBcEMAQzBDAEOwRMBD0EMAAgAEcAcgBhAHkALQQzBDAEPAQwACAAMgAuADIAUAByAG8AZgBpAGwAIABnAOkAbgDpAHIAaQBxAHUAZQAgAGcAcgBpAHMAIABnAGEAbQBtAGEAIAAyACwAMgDBAGwAdABhAGwA4QBuAG8AcwAgAHMAegD8AHIAawBlACAAZwBhAG0AbQBhACAAMgAuADKQGnUocHCWjlFJXqYAMgAuADKCcl9pY8+P8Md8vBgAINaMwMkAIKwQucgAIAAyAC4AMgAg1QS4XNMMx3wARwBlAG4AZQByAGkAcwBrACAAZwByAOUAIABnAGEAbQBtAGEAIAAyACwAMgAtAHAAcgBvAGYAaQBsAE8AYgBlAGMAbgDhACABYQBlAGQA4QAgAGcAYQBtAGEAIAAyAC4AMgXSBdAF3gXUACAF0AXkBdUF6AAgBdsF3AXcBdkAIAAyAC4AMgBHAGEAbQBhACAAZwByAGkAIABnAGUAbgBlAHIAaQBjAQMAIAAyACwAMgBBAGwAbABnAGUAbQBlAGkAbgBlAHMAIABHAHIAYQB1AHMAdAB1AGYAZQBuAC0AUAByAG8AZgBpAGwAIABHAGEAbQBtAGEAIAAyACwAMgBQAHIAbwBmAGkAbABvACAAZwByAGkAZwBpAG8AIABnAGUAbgBlAHIAaQBjAG8AIABkAGUAbABsAGEAIABnAGEAbQBtAGEAIAAyACwAMgBHAGUAbgBlAHIAaQBzAGsAIABnAHIA5QAgADIALAAyACAAZwBhAG0AbQBhAHAAcgBvAGYAaQBsZm6QGnBwXqZ8+2VwADIALgAyY8+P8GWHTvZOAIIsMLAw7DCkMKww8zDeACAAMgAuADIAIDDXMO0w1TChMKQw6wOTA7UDvQO5A7oDzAAgA5MDugPBA7kAIAOTA6wDvAO8A7EAIAAyAC4AMgBQAGUAcgBmAGkAbAAgAGcAZQBuAOkAcgBpAGMAbwAgAGQAZQAgAGMAaQBuAHoAZQBuAHQAbwBzACAAZABhACAARwBhAG0AbQBhACAAMgAsADIAQQBsAGcAZQBtAGUAZQBuACAAZwByAGkAagBzACAAZwBhAG0AbQBhACAAMgAsADIALQBwAHIAbwBmAGkAZQBsAFAAZQByAGYAaQBsACAAZwBlAG4A6QByAGkAYwBvACAAZABlACAAZwBhAG0AbQBhACAAZABlACAAZwByAGkAcwBlAHMAIAAyACwAMg4jDjEOBw4qDjUOQQ4BDiEOIQ4yDkAOAQ4jDiIOTA4XDjEOSA4nDkQOGwAgADIALgAyAEcAZQBuAGUAbAAgAEcAcgBpACAARwBhAG0AYQAgADIALAAyAFkAbABlAGkAbgBlAG4AIABoAGEAcgBtAGEAYQBuACAAZwBhAG0AbQBhACAAMgAsADIAIAAtAHAAcgBvAGYAaQBpAGwAaQBHAGUAbgBlAHIAaQENAGsAaQAgAEcAcgBhAHkAIABHAGEAbQBtAGEAIAAyAC4AMgAgAHAAcgBvAGYAaQBsAFUAbgBpAHcAZQByAHMAYQBsAG4AeQAgAHAAcgBvAGYAaQBsACAAcwB6AGEAcgBvAVsAYwBpACAAZwBhAG0AbQBhACAAMgAsADIGOgYnBkUGJwAgADIALgAyACAGRAZIBkYAIAYxBkUGJwYvBkoAIAY5BicGRQQeBDEESQQwBE8AIARBBDUEQAQwBE8AIAQzBDAEPAQ8BDAAIAAyACwAMgAtBD8EQAQ+BEQEOAQ7BEwARwBlAG4AZQByAGkAYwAgAEcAcgBhAHkAIABHAGEAbQBtAGEAIAAyAC4AMgAgAFAAcgBvAGYAaQBsAGUAAHRleHQAAAAAQ29weXJpZ2h0IEFwcGxlIEluYy4sIDIwMTIAAFhZWiAAAAAAAADzUQABAAAAARbMY3VydgAAAAAAAAQAAAAABQAKAA8AFAAZAB4AIwAoAC0AMgA3ADsAQABFAEoATwBUAFkAXgBjAGgAbQByAHcAfACBAIYAiwCQAJUAmgCfAKQAqQCuALIAtwC8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', 'base64') })
  assert.equal(response.ok, true)
  const { storageId } = await response.json()
  await client.mutation(api.tasks.updateScreenshot, { screenshotId: firstId, storageId, processing: { kind: 'pending' } })
  task = await getTask()
  assert.equal(task.screenshots.length, 2)
  assert.ok(task.screenshots[0].url)
  assert.equal(task.screenshots[0].ocr.kind, 'pending')
  await pause('Finished recording with one uploaded original and one pending upload')

  await client.mutation(api.tasks.updateScreenshot, { screenshotId: secondId, processing: { kind: 'failed', error: 'Verification upload interruption' } })
  await client.mutation(api.tasks.failProcessing, { taskId, error: 'Verification upload interruption' })
  assert.equal((await getTask()).processing.kind, 'failed')
  // A retry can write to the same screenshot and upload to a finished task.
  await client.mutation(api.tasks.generateUploadUrl, { taskId })
  const processing = {
    kind: 'completed', redactedStorageId: storageId,
    result: { model: 'tesseract.js', revision: '7.0.0', language: 'eng+deu', width: 1, height: 1, text: '', regions: [] },
    redaction: { model: 'desert-ant-labs/redact', revision: 'v0.4.0', text: '', spans: [], boxes: [], timings: { ocrMs: 1, piiMs: 1, maskMs: 1, totalMs: 3, uploadMs: 1 } },
  }
  for (const screenshotId of [firstId, secondId]) await client.mutation(api.tasks.updateScreenshot, { screenshotId, storageId, processing })
  await client.mutation(api.tasks.completeProcessing, { taskId, error: null })
  task = await getTask()
  assert.equal(task.processing.kind, 'completed')
  assert.equal(task.completion.durationMs, 4_000)
  assert.equal(task.screenshots.length, 2)
  assert.ok(task.screenshots.every((shot) => shot.ocr.kind === 'completed' && shot.redactedUrl))
  await pause('Finished processing')
  console.log('Verified: immediate completion, pending timeline entries, late uploads, failure/retry, duplicate registration, and completed processing.')
} finally {
  // Only the disposable project created above is removed.
  const task = await getTask()
  for (const shot of task.screenshots) {
    if (shot.ocr?.kind === 'pending') await client.mutation(api.tasks.updateScreenshot, { screenshotId: shot._id, processing: { kind: 'failed', error: 'Verification cleanup' } })
  }
  if (!task.completion) await client.mutation(api.tasks.finish, { taskId, durationMs: 4_000, error: 'Verification cleanup' })
  await client.mutation(api.tasks.completeProcessing, { taskId, error: 'Verification cleanup' })
  await client.mutation(api.projects.remove, { projectId })
}

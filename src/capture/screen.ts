import { maskPii } from '../shared/pii'
import { session, useSession } from '../shared/session'

export type Screenshot = {
  blob: Blob
  capturedAt: number
  offsetMs: number
}

export type RecordingResult = { durationMs: number; error: string | null; audio: Blob | null }
export type ScreenRecording = { finish: () => Promise<RecordingResult> }

export async function openScreenCapture() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Screen capture is unavailable. Use a supported desktop browser over HTTPS or localhost.')
  }
  if (!navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Microphone recording is unavailable in this browser.')
  }
  const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
    .find((type) => MediaRecorder.isTypeSupported(type))
  if (!mimeType) throw new Error('This browser cannot record microphone audio in a supported format.')
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'monitor' },
    audio: false,
  })
  let microphone: MediaStream | null = null
  const video = document.createElement('video')
  const close = () => {
    stream.getTracks().forEach((track) => track.stop())
    microphone?.getTracks().forEach((track) => track.stop())
    video.pause()
    video.srcObject = null
  }

  try {
    const track = stream.getVideoTracks()[0]
    if (!track || track.getSettings().displaySurface !== 'monitor') {
      throw new Error('Choose an entire screen in the sharing dialog to record your workflow.')
    }
    try {
      microphone = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    } catch (failure) {
      throw new Error(`Microphone access is required to record a task. ${failure instanceof Error ? failure.message : 'Allow microphone access and try again.'}`)
    }
    const microphoneTrack = microphone.getAudioTracks()[0]
    if (!microphoneTrack || microphoneTrack.readyState !== 'live') throw new Error('The microphone is unavailable.')
    const audioRecorder = new MediaRecorder(microphone, { mimeType })
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    await video.play()
    if (track.readyState !== 'live' || !video.videoWidth || !video.videoHeight) {
      throw new Error('The shared screen is unavailable. Start a new task and share your screen again.')
    }
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot capture screenshots.')
    const drawScreenshot = () => {
      context.drawImage(video, 0, 0)
      maskPii(context, video.videoWidth) // personal data never leaves the browser unmasked
    }
    const startedAt = Date.now()
    const startTime = performance.now()

    return {
      startedAt,
      close,
      start({ onScreenshot, onStopped }: {
        onScreenshot: (screenshot: Screenshot) => Promise<void>
        onStopped: () => void
      }): ScreenRecording {
        if (track.readyState !== 'live') throw new Error('Screen sharing has stopped.')
        if (microphoneTrack.readyState !== 'live') throw new Error('The microphone has stopped.')
        const timer = new Worker(new URL('./screenshot-timer.worker.ts', import.meta.url), { type: 'module' })
        const pending = new Set<Promise<void>>()
        let error: string | null = null
        let finished: Promise<RecordingResult> | null = null
        let stopped = false
        const chunks: Blob[] = []
        const audio = new Promise<Blob | null>((resolve) => {
          audioRecorder.ondataavailable = ({ data }) => {
            if (data.size) chunks.push(data)
          }
          audioRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: audioRecorder.mimeType })
            if (!blob.size) error ??= 'No microphone audio was recorded.'
            resolve(blob.size ? blob : null)
            if (!stopped) {
              error ??= 'Microphone recording stopped unexpectedly.'
              onStopped()
            }
          }
        })
        audioRecorder.onerror = () => {
          error ??= 'Microphone recording failed. Any recorded audio will be saved.'
          onStopped()
        }
        microphoneTrack.onended = () => {
          error ??= 'The microphone was disconnected. Recording stopped.'
          onStopped()
        }
        try {
          audioRecorder.start(1_000)
        } catch (failure) {
          timer.terminate()
          throw failure
        }
        const syncAudioPause = () => {
          if (session().offRecord && audioRecorder.state === 'recording') audioRecorder.pause()
          else if (!session().offRecord && audioRecorder.state === 'paused') audioRecorder.resume()
        }
        const unsubscribe = useSession.subscribe(syncAudioPause)
        syncAudioPause()

        function capture() {
          if (stopped || session().offRecord) return // off the record: no screenshots
          const job = (async () => {
            if (track.readyState !== 'live' || track.muted || video.readyState < 2) {
              throw new Error('Screen capture was interrupted. Saved screenshots are still available.')
            }
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            drawScreenshot()
            const capturedAt = Date.now()
            const offsetMs = Math.round(performance.now() - startTime)
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode the screenshot.')), 'image/jpeg', 0.85)
            })
            await onScreenshot({ blob, capturedAt, offsetMs })
          })().catch((failure: unknown) => {
            error ??= failure instanceof Error ? failure.message : 'Could not save the screenshot.'
            if (!stopped) onStopped()
          }).finally(() => pending.delete(job))
          pending.add(job)
        }

        timer.onmessage = capture
        timer.onerror = () => {
          error = 'The screenshot timer stopped unexpectedly.'
          onStopped()
        }
        track.onended = onStopped
        capture()

        return {
          finish() {
            if (!finished) {
              stopped = true
              const durationMs = Math.round(performance.now() - startTime)
              timer.terminate()
              unsubscribe()
              track.onended = null
              microphoneTrack.onended = null
              if (audioRecorder.state !== 'inactive') audioRecorder.stop()
              close()
              finished = Promise.all([Promise.all(pending), audio]).then(([, audio]) => ({ durationMs, error, audio }))
            }
            return finished
          },
        }
      },
    }
  } catch (error) {
    close()
    throw error
  }
}

export function formatDuration(durationMs: number) {
  const seconds = Math.floor(durationMs / 1_000)
  const minutes = Math.floor(seconds / 60)
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

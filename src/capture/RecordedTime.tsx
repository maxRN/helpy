import { useEffect, useState } from 'react'

export function RecordedTime({ timestamp, timeOnly = false }: { timestamp: number; timeOnly?: boolean }) {
  const [text, setText] = useState(() => new Date(timestamp).toISOString())
  useEffect(() => {
    const date = new Date(timestamp)
    setText(timeOnly ? date.toLocaleTimeString() : date.toLocaleString())
  }, [timestamp, timeOnly])
  return <time dateTime={new Date(timestamp).toISOString()}>{text}</time>
}

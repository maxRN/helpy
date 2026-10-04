import { initials } from '../auth'

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-helpy-soft font-semibold text-helpy"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {initials(name) || '?'}
    </span>
  )
}

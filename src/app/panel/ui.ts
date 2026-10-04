// Shared class names for Helpy's panel: large targets and plain contrast, so Sabine (57) can use it alone.
export const primaryBtn =
  'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-helpy px-5 text-[17px] font-semibold text-white transition-colors duration-150 hover:bg-helpy-dark active:scale-[0.98] disabled:opacity-50'
export const secondaryBtn =
  'flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-helpy-line bg-white px-5 text-[17px] font-medium text-ink transition-colors duration-150 hover:border-faint disabled:opacity-50'
export const textBtn = 'h-10 rounded-lg px-2 text-[15px] font-medium text-helpy transition-colors duration-150 hover:text-helpy-dark'
export const field =
  'w-full rounded-xl border border-helpy-line bg-white px-4 text-[17px] text-ink outline-none transition-colors duration-150 placeholder:text-faint focus:border-helpy'

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

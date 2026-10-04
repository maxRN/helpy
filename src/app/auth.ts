// Sign-in for the demo. A mock: every password works and nothing leaves this browser.
// It only decides whose name goes on a recording and how Helpy greets you.
import { create } from 'zustand'

export interface User {
  name: string
  role: string
  email?: string
}

/** Known accounts at Hartmann Machine Works; any other email signs in with a name made from it. */
const PEOPLE: Record<string, User> = {
  'sabine.brandt@hartmann.de': { name: 'Sabine Brandt', role: 'Accounts payable' },
  'lena.hoffmann@hartmann.de': { name: 'Lena Hoffmann', role: 'Accounts payable, new' },
}

export const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

/** "sabine.brandt@hartmann.de" -> Sabine Brandt. */
export function userFromEmail(email: string): User {
  const clean = email.trim().toLowerCase()
  const known = PEOPLE[clean]
  if (known) return { ...known, email: clean }
  const name = clean
    .split('@')[0]!
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')
  return { name: name || clean, role: '', email: clean }
}

const KEY = 'helpy-user'

function restore(): User | null {
  try {
    const u = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<User> | null
    return typeof u?.name === 'string' && u.name.trim()
      ? { name: u.name, role: typeof u.role === 'string' ? u.role : '', ...(typeof u.email === 'string' ? { email: u.email } : {}) }
      : null
  } catch {
    return null
  }
}

export const useAuth = create<{ user: User | null }>()(() => ({ user: typeof window === 'undefined' ? null : restore() }))

export const auth = {
  user: () => useAuth.getState().user,
  signIn(user: User) {
    useAuth.setState({ user })
    try {
      localStorage.setItem(KEY, JSON.stringify(user))
    } catch {
      // Storage can be blocked; then the sign-in lasts until the page reloads.
    }
  },
  signOut() {
    useAuth.setState({ user: null })
    try {
      localStorage.removeItem(KEY)
    } catch {
      // Ignore blocked storage.
    }
  },
}

export const firstName = (u: User | null) => u?.name.split(' ')[0] ?? ''

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

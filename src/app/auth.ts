// Sign-in for the demo. A mock: every password works and nothing leaves this browser.
// It only decides whose name goes on a recording and how Helpy greets you.
import { create } from 'zustand'

export interface User {
  name: string
  role: string
}

/** The people at Hartmann Machine Works who use this computer (shown as tiles on the sign-in). */
export const PEOPLE: User[] = [
  { name: 'Sabine Brandt', role: 'Accounts payable' },
  { name: 'Lena Hoffmann', role: 'Accounts payable, new' },
]

const KEY = 'helpy-user'

function restore(): User | null {
  try {
    const u = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<User> | null
    return typeof u?.name === 'string' && u.name.trim() ? { name: u.name, role: typeof u.role === 'string' ? u.role : '' } : null
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

// Who is working at this computer. A mockup: no sign-in, Sabine Brandt is always signed in.
// It only decides whose name goes on a recording and how Helpy greets you.
import { create } from 'zustand'

export interface User {
  name: string
  role: string
  email?: string
}

export const SABINE: User = { name: 'Sabine Brandt', role: 'Accounts payable', email: 'sabine.brandt@hartmann.de' }

export const useAuth = create<{ user: User }>()(() => ({ user: SABINE }))

export const auth = {
  user: () => useAuth.getState().user,
}

export const firstName = (u: User | null) => u?.name.split(' ')[0] ?? ''

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

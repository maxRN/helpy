import { useState } from 'react'
import { mascot } from '../../mascot'
import { auth, firstName, initials, PEOPLE, type User } from '../auth'
import { panel } from './store'
import { field, primaryBtn, textBtn } from './ui'

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

/** Sign-in as on a shared office computer: pick yourself, type your password. A mock: every password works. */
export function SignInView() {
  const [person, setPerson] = useState<User | 'other' | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')

  const who: User | null = person === 'other' ? (name.trim() ? { name: name.trim(), role: '' } : null) : person
  const submit = () => {
    if (!who || !password) return
    auth.signIn(who)
    panel.close()
    mascot.pose('wave', 2600)
    mascot.setState('speaking')
    mascot.bubble(`Hi ${firstName(who)}! Click me whenever you need me.`, { ttlMs: 6000 })
    setTimeout(() => mascot.setState('idle'), 2600)
  }

  if (!person) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="m-0 text-[22px] font-semibold tracking-tight text-ink">Who is working today?</h2>
          <p className="m-0 mt-1 text-[16px] text-muted">Hartmann Machine Works</p>
        </div>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {PEOPLE.map((p) => (
            <li key={p.name}>
              <button
                type="button"
                onClick={() => setPerson(p)}
                className="flex w-full items-center gap-3 rounded-xl border border-helpy-line px-3 py-3 text-left transition-colors duration-150 hover:border-faint"
              >
                <Avatar name={p.name} />
                <span className="min-w-0">
                  <span className="block text-[17px] font-medium text-ink">{p.name}</span>
                  <span className="block text-[14px] text-muted">{p.role}</span>
                </span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setPerson('other')} className={`${textBtn} -ml-2`}>
              Someone else
            </button>
          </li>
        </ul>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {person === 'other' ? (
        <div>
          <h2 className="m-0 text-[22px] font-semibold tracking-tight text-ink">Sign in</h2>
          <label htmlFor="helpy-signin-name" className="mt-4 block text-[16px] font-medium text-ink">
            Your name
          </label>
          <input id="helpy-signin-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" className={`${field} mt-2 h-12`} />
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Avatar name={person.name} size={52} />
          <div className="min-w-0">
            <h2 className="m-0 text-[21px] font-semibold tracking-tight text-ink">{person.name}</h2>
            <p className="m-0 text-[15px] text-muted">{person.role}</p>
          </div>
        </div>
      )}
      <div>
        <label htmlFor="helpy-signin-password" className="block text-[16px] font-medium text-ink">
          Password
        </label>
        <input
          id="helpy-signin-password"
          type="password"
          autoFocus={person !== 'other'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${field} mt-2 h-12`}
        />
        <p className="m-0 mt-1.5 text-[14px] text-faint">Demo: any password works.</p>
      </div>
      <button type="submit" className={primaryBtn} disabled={!who || !password}>
        Sign in
      </button>
      <button
        type="button"
        className={`${textBtn} -mt-1 self-start`}
        onClick={() => {
          setPerson(null)
          setPassword('')
        }}
      >
        {person === 'other' ? '‹ Back' : '‹ Not you?'}
      </button>
    </form>
  )
}

import { useState } from 'react'
import { mascot } from '../../mascot'
import { auth, firstName, initials, looksLikeEmail, userFromEmail } from '../auth'
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

/** Sign-in in two steps: work email, then password. A mock: every email and password work. */
export function SignInView() {
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'email' | 'password'>('email')
  const [password, setPassword] = useState('')

  if (step === 'email') {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (looksLikeEmail(email)) setStep('password')
        }}
      >
        <div>
          <h2 className="m-0 text-[22px] font-semibold tracking-tight text-ink">Sign in to Helpy</h2>
          <p className="m-0 mt-1 text-[16px] text-muted">Hartmann Machine Works</p>
        </div>
        <div>
          <label htmlFor="helpy-signin-email" className="block text-[16px] font-medium text-ink">
            Work email
          </label>
          <input
            id="helpy-signin-email"
            type="email"
            autoFocus
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sabine.brandt@hartmann.de"
            className={`${field} mt-2 h-12`}
          />
        </div>
        <button type="submit" className={primaryBtn} disabled={!looksLikeEmail(email)}>
          Continue
        </button>
      </form>
    )
  }

  const user = userFromEmail(email)
  return (
    <form
      className="flex flex-col gap-4"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault()
        if (!password) return
        auth.signIn(user)
        panel.close()
        mascot.pose('wave', 2600)
        mascot.setState('speaking')
        mascot.bubble(`Hi ${firstName(user)}! Click me whenever you need me.`, { ttlMs: 6000 })
        setTimeout(() => mascot.setState('idle'), 2600)
      }}
    >
      <div className="flex items-center gap-3">
        <Avatar name={user.name} size={48} />
        <div className="min-w-0">
          <h2 className="m-0 truncate text-[20px] font-semibold tracking-tight text-ink">{user.name}</h2>
          <p className="m-0 truncate text-[15px] text-muted">{user.email}</p>
        </div>
      </div>
      <div>
        <label htmlFor="helpy-signin-password" className="block text-[16px] font-medium text-ink">
          Password
        </label>
        <input id="helpy-signin-password" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className={`${field} mt-2 h-12`} />
        <p className="m-0 mt-1.5 text-[14px] text-faint">Demo: any password works.</p>
      </div>
      <button type="submit" className={primaryBtn} disabled={!password}>
        Sign in
      </button>
      <button
        type="button"
        className={`${textBtn} -mt-1 self-start`}
        onClick={() => {
          setStep('email')
          setPassword('')
        }}
      >
        ‹ Use another email
      </button>
    </form>
  )
}

import { useSession } from '../../shared/session'
import { auth, firstName, useAuth } from '../auth'
import { recordFlow } from '../RecordDialog'
import { askQuestions } from './questions'
import { panel } from './store'
import { statusOf, useProcesses } from './processes'
import { Avatar } from './SignInView'
import { primaryBtn, secondaryBtn, textBtn } from './ui'

/** First thing Helpy shows: one main action (record), the way into what the team knows, and open questions if any. */
export function HomeView() {
  const processes = useProcesses()
  const user = useAuth((s) => s.user)
  const sessionId = useSession((s) => s.sessionId)
  // Questions are about the latest recording on this computer (the debrief works on the current session).
  const waiting = (processes ?? []).find((p) => !p.example && p.sessionId === sessionId && (statusOf(p) === 'questions' || statusOf(p) === 'processing'))

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="m-0 text-[22px] font-semibold tracking-tight text-ink">{user ? `Hi ${firstName(user)}` : 'Hi, I’m Helpy'}</h2>
        <p className="m-0 mt-1 text-[16px] leading-snug text-muted">I learn how you work and pass it on to your team.</p>
      </div>

      {waiting ? (
        <div className="rounded-xl bg-ask-soft p-4">
          <p className="m-0 text-[16px] font-medium leading-snug text-ink">I have a few questions about “{waiting.name}”.</p>
          <button type="button" onClick={askQuestions} className={`${primaryBtn} mt-3`}>
            Answer now
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => recordFlow.open()} className={primaryBtn}>
          <span className="size-3 rounded-full bg-white" aria-hidden />
          Record what I do
        </button>
        <button type="button" onClick={() => panel.show({ name: 'library' })} className={secondaryBtn}>
          Recorded processes
        </button>
      </div>

      {user ? (
        <div className="-mb-1 flex items-center gap-2.5 border-t border-helpy-line pt-3">
          <Avatar name={user.name} size={32} />
          <span className="min-w-0 flex-1 truncate text-[15px] text-muted">{user.name}</span>
          <button
            type="button"
            className={`${textBtn} text-muted`}
            onClick={() => {
              auth.signOut()
              panel.show({ name: 'signin' })
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  )
}

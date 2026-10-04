// Off the record while learning (Teach): Helpy's ears are off, so it says how to come back, with a "Continue"
// button. A click is the only way back: listening for "back on the record" would mean sending audio while paused.
import { mascot } from '../mascot'
import { useSession } from '../shared/session'
import { setOffRecord } from './voice'

const LINE = 'Off the record: I’m not listening. Click Continue when you’re ready.'

export const offRecordPrompt = {
  /** The paused bubble with "Continue" (again, e.g. after a click on the robot). */
  show() {
    mascot.bubble(LINE, { topic: 'prompt', actions: [{ label: 'Continue', primary: true, onClick: () => void setOffRecord(false) }] })
  },
  /** True while a lesson is paused off the record. */
  active: () => useSession.getState().mode === 'teach' && useSession.getState().offRecord,
  /** Call once on the client. Returns an uninstall function. */
  install(): () => void {
    return useSession.subscribe((s, prev) => {
      if (s.mode !== 'teach' || s.offRecord === prev.offRecord) return
      if (s.offRecord) offRecordPrompt.show()
      else if (useSession.getState().offRecord === false) mascot.resolve('prompt')
    })
  },
}

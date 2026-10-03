import { openDebrief } from '../../debrief/DebriefPanel'
import { mascot } from '../../mascot'
import { startVoice } from '../voice'
import { panel } from './store'

/** Helpy's follow-up questions: P3's debrief (gaps, answers, Work Map, teach-back), spoken when the agent runs. */
export function askQuestions() {
  panel.close()
  mascot.bubble(null)
  void startVoice('debrief')
  openDebrief()
}

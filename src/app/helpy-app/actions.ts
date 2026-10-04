import { mascot } from '../../mascot'
import { startLearning } from '../panel/learning'
import type { Process } from '../panel/processes'
import { askQuestions } from '../panel/questions'
import { recordFlow } from '../RecordDialog'
import { helpyApp } from './store'

// Everything that leaves the app for the screen: the window closes and the robot takes over.

export function teach(process: Process) {
  helpyApp.close()
  void startLearning(process)
}

export function answerQuestions() {
  helpyApp.close()
  askQuestions()
}

export function recordAgain(process: Process) {
  helpyApp.close()
  recordFlow.open({ name: process.name, id: process.id })
}

/** Point at the field in the ERP (only works while the ERP window shows it). */
export function showWhere(targetId: string, title: string) {
  helpyApp.close()
  mascot.pointTo(targetId)
  mascot.bubble(title, { ttlMs: 6000 })
}

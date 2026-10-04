// Owned by P4. Helpy, the robot on the screen: state, speech bubble, pointing at registered elements.
// State, bubble and target live in src/shared/mascot.ts (written by the voice agent too).
export { mascot, type BubbleOptions } from './api'
export { MascotLayer, setMascotClickHandler, SIZE as MASCOT_SIZE, visibleBounds } from './MascotLayer'
export { HelpyMark, Robot } from './Robot'
export { useHelpyExtras, type BubbleAction, type BubbleInput, type Pose } from './store'
